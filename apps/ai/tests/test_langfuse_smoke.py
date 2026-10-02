import re
from collections import Counter
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from http import HTTPStatus

import pytest
from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import ExportTraceServiceRequest
from opentelemetry.proto.common.v1.common_pb2 import KeyValue
from opentelemetry.proto.trace.v1.trace_pb2 import Span as ProtoSpan
from opentelemetry.proto.trace.v1.trace_pb2 import Status as ProtoStatus

from app.observability.telemetry_config import DEPLOYMENT_ENVIRONMENT_ATTRIBUTE
from app.providers.model_provider import ModelIntentRequest, ModelOutputSpec, ModelUnavailableError
from smoke import langfuse_smoke
from smoke.langfuse_smoke import (
    EXPECTED_OBSERVATIONS,
    EXPECTED_TRACE_SIZES,
    SMOKE_ENVIRONMENT,
    SYNTHETIC_PROMPT,
    SYNTHETIC_REFINEMENT,
    main,
)
from smoke.synthetic_provider import (
    SYNTHETIC_ARTISTS,
    SYNTHETIC_REQUEST_MODEL,
    SYNTHETIC_RESPONSE_MODEL,
    SyntheticModelProvider,
    SyntheticReply,
    interpreted_intent_payload,
    synthetic_usage,
)
from tests.telemetry_fakes import (
    FAKE_LANGFUSE_BASIC_CREDENTIALS,
    FAKE_LANGFUSE_SECRETS,
    LANGFUSE_LOOPBACK_TRACES_PATH,
    LOOPBACK_HOST,
    ReceivedExport,
    langfuse_otlp_environ,
    loopback_otlp_receiver,
)

CONFIRM = ("--confirm",)
OTLP_TIMEOUT = "2"
TYPE = "langfuse.observation.type"
MODEL = "langfuse.observation.model.name"
RESULT = "langfuse.observation.metadata.result"
TRACE_ID_PATTERN = re.compile(r"\b[0-9a-f]{32}\b")
PROVIDER_KEY_SENTINEL = "SMOKE_PROVIDER_KEY_SENTINEL"
AUTHORIZATION_ONLY_HEADERS = f"Authorization=Basic%20{FAKE_LANGFUSE_BASIC_CREDENTIALS}"
SYNTHETIC_CONTENT = (SYNTHETIC_PROMPT, SYNTHETIC_REFINEMENT, *SYNTHETIC_ARTISTS)
SERVER = ProtoSpan.SpanKind.SPAN_KIND_SERVER
INTERNAL = ProtoSpan.SpanKind.SPAN_KIND_INTERNAL
CLIENT = ProtoSpan.SpanKind.SPAN_KIND_CLIENT
UNSET = ProtoStatus.StatusCode.STATUS_CODE_UNSET
ERROR = ProtoStatus.StatusCode.STATUS_CODE_ERROR


@dataclass(frozen=True, slots=True)
class DecodedSpan:
    span: ProtoSpan
    attributes: Mapping[str, object]
    resource: Mapping[str, object]


@dataclass(frozen=True, slots=True)
class SmokeRun:
    output: str
    exit_message: str | None
    received: list[ReceivedExport]
    environ: Mapping[str, str]

    @property
    def spans(self) -> list[DecodedSpan]:
        return [
            DecodedSpan(span, _values(span.attributes), _values(resource_spans.resource.attributes))
            for export in self.received
            for resource_spans in ExportTraceServiceRequest.FromString(export.body).resource_spans
            for scope_spans in resource_spans.scope_spans
            for span in scope_spans.spans
        ]

    @property
    def traces(self) -> list[list[DecodedSpan]]:
        by_trace: dict[bytes, list[DecodedSpan]] = {}
        for decoded in self.spans:
            by_trace.setdefault(decoded.span.trace_id, []).append(decoded)
        return sorted(
            (sorted(members, key=_start) for members in by_trace.values()),
            key=lambda members: _start(members[0]),
        )


def _values(attributes: Iterable[KeyValue]) -> dict[str, object]:
    values: dict[str, object] = {}
    for item in attributes:
        field = item.value.WhichOneof("value")
        values[item.key] = getattr(item.value, field) if field else None
    return values


def _start(decoded: DecodedSpan) -> int:
    return decoded.span.start_time_unix_nano


def _run_smoke(
    capsys: pytest.CaptureFixture[str],
    *,
    argv: Sequence[str] = CONFIRM,
    status: HTTPStatus = HTTPStatus.OK,
    environ: Mapping[str, str] | None = None,
) -> SmokeRun:
    exit_message: str | None = None
    with loopback_otlp_receiver(status) as (port, received):
        smoke_environ = {**langfuse_otlp_environ(port, OTLP_TIMEOUT), **(environ or {})}
        try:
            main(argv, smoke_environ)
        except SystemExit as stopped:
            exit_message = str(stopped.code)
    captured = capsys.readouterr()
    output = captured.out + captured.err + (exit_message or "")
    return SmokeRun(output, exit_message, received, smoke_environ)


def _forbid_app_construction(monkeypatch: pytest.MonkeyPatch) -> None:
    def forbidden(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("the smoke must not build the service")

    monkeypatch.setattr(langfuse_smoke, "create_app", forbidden)


def _forbid_real_model_providers(monkeypatch: pytest.MonkeyPatch) -> None:
    def forbidden(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("the smoke must never build a real model provider")

    monkeypatch.setattr("app.main.build_model_provider", forbidden)
    monkeypatch.setattr("app.providers.registry.build_model_provider", forbidden)
    monkeypatch.setattr("app.providers.openai.provider.build_openai_provider", forbidden)
    monkeypatch.setattr(
        "app.providers.openai.provider.OpenAIIntentModelProvider.__init__", forbidden
    )


def _assert_nothing_sensitive(run: SmokeRun, *extra: str) -> None:
    configured = [
        value
        for name, value in run.environ.items()
        if name.startswith("OTEL_EXPORTER_OTLP") and name != "OTEL_EXPORTER_OTLP_TRACES_TIMEOUT"
    ]
    for sentinel in (*FAKE_LANGFUSE_SECRETS, *configured, LOOPBACK_HOST, *extra):
        assert not sentinel or sentinel not in run.output
    for request in run.received:
        for sentinel in (*SYNTHETIC_CONTENT, *extra):
            assert sentinel.encode() not in request.body


def test_confirmed_smoke_exports_three_synthetic_traces_with_ten_observations(
    capsys: pytest.CaptureFixture[str],
) -> None:
    run = _run_smoke(capsys)

    traces = run.traces
    interpretation, refinement, recovered = traces
    assert run.exit_message is None
    assert len(run.spans) == EXPECTED_OBSERVATIONS == 10
    assert len({decoded.span.span_id for decoded in run.spans}) == EXPECTED_OBSERVATIONS
    assert [len(members) for members in traces] == EXPECTED_TRACE_SIZES == [3, 3, 4]
    assert Counter(decoded.attributes[TYPE] for decoded in run.spans) == {
        "span": 6,
        "generation": 4,
    }
    for request in run.received:
        assert request.path == LANGFUSE_LOOPBACK_TRACES_PATH
        assert request.headers["authorization"] == f"Basic {FAKE_LANGFUSE_BASIC_CREDENTIALS}"
        assert request.headers["x-langfuse-ingestion-version"] == "4"

    for members in traces:
        server, use_case, *generations = members
        assert (server.span.kind, use_case.span.kind) == (SERVER, INTERNAL)
        assert server.span.parent_span_id == b""
        assert use_case.span.parent_span_id == server.span.span_id
        assert use_case.attributes[RESULT] == "completed"
        assert "gen_ai.usage.input_tokens" not in use_case.attributes
        for generation in generations:
            assert generation.span.kind == CLIENT
            assert generation.span.parent_span_id == use_case.span.span_id
            assert generation.attributes[MODEL] == SYNTHETIC_RESPONSE_MODEL
            assert generation.attributes["gen_ai.request.model"] == SYNTHETIC_REQUEST_MODEL
            assert generation.attributes["gen_ai.usage.input_tokens"]
        for decoded in members:
            assert decoded.resource[DEPLOYMENT_ENVIRONMENT_ATTRIBUTE] == SMOKE_ENVIRONMENT

    assert interpretation[1].attributes["langfuse.observation.metadata.operation"] == (
        "intent_interpretation"
    )
    assert refinement[1].attributes["langfuse.observation.metadata.operation"] == (
        "refinement_interpretation"
    )
    failed, succeeded = recovered[2:]
    assert (failed.span.status.code, failed.attributes[RESULT]) == (ERROR, "invalid_output")
    assert (succeeded.span.status.code, succeeded.attributes[RESULT]) == (UNSET, "ok")
    assert recovered[1].span.status.code == UNSET

    printed = TRACE_ID_PATTERN.findall(run.output)
    assert printed == [members[0].span.trace_id.hex() for members in traces]
    assert "10 of 10 handed to the OTLP exporter (6 span, 4 generation)" in run.output
    assert f"{len(run.received)} acknowledged with HTTP 2xx, 0 not acknowledged" in run.output
    assert "200, 200, 200" in run.output
    assert "4 of 4" in run.output
    _assert_nothing_sensitive(run)


def test_smoke_ignores_model_credentials_and_telemetry_settings_from_the_environment(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    _forbid_real_model_providers(monkeypatch)

    run = _run_smoke(
        capsys,
        environ={
            "AI_SERVICE_ENV": "production",
            "AI_PROVIDER": "openai",
            "AI_MODEL": "real-model-name",
            "AI_PROVIDER_API_KEY": PROVIDER_KEY_SENTINEL,
            "ALLOW_PAID_AI_EVALS": "true",
            "OTEL_SDK_DISABLED": "true",
            "OTEL_TRACES_EXPORTER": "console",
            "AI_TELEMETRY_BACKEND": "generic",
            "OTEL_TRACES_SAMPLER_ARG": "0",
            "OTEL_RESOURCE_ATTRIBUTES": "deployment.environment.name=production",
        },
    )

    assert run.exit_message is None
    assert [len(members) for members in run.traces] == EXPECTED_TRACE_SIZES
    assert {decoded.resource[DEPLOYMENT_ENVIRONMENT_ATTRIBUTE] for decoded in run.spans} == {
        SMOKE_ENVIRONMENT
    }
    assert {decoded.attributes[MODEL] for decoded in run.spans if MODEL in decoded.attributes} == {
        SYNTHETIC_RESPONSE_MODEL
    }
    _assert_nothing_sensitive(run, PROVIDER_KEY_SENTINEL, "real-model-name")


def test_without_confirm_only_the_plan_is_printed_and_nothing_runs(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    _forbid_app_construction(monkeypatch)

    run = _run_smoke(capsys, argv=())

    assert run.received == []
    assert run.exit_message is not None
    assert run.exit_message.startswith("Nothing was sent.")
    assert "npm run smoke:langfuse -- --confirm" in run.exit_message
    assert "functional requests:    3 (interpretation; refinement; recovered retry)" in run.output
    assert "observations:           10 unique spans (3 + 3 + 4)" in run.output
    assert "destination:            loopback" in run.output
    assert "not guaranteed and not exactly once" in run.output
    _assert_nothing_sensitive(run)


def test_abbreviated_confirmation_is_rejected(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    _forbid_app_construction(monkeypatch)

    run = _run_smoke(capsys, argv=("--conf",))

    assert run.received == []
    assert run.exit_message == "2"


@pytest.mark.parametrize(
    ("environ", "named_variable"),
    [
        (
            {"OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": "https://example.test/v1/traces?k=SECRETQ"},
            "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
        ),
        (
            {"OTEL_EXPORTER_OTLP_TRACES_HEADERS": AUTHORIZATION_ONLY_HEADERS},
            "OTEL_EXPORTER_OTLP_TRACES_HEADERS",
        ),
        (
            {"OTEL_EXPORTER_OTLP_HEADERS": AUTHORIZATION_ONLY_HEADERS},
            "OTEL_EXPORTER_OTLP_HEADERS",
        ),
        ({"OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": ""}, "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"),
    ],
    ids=["endpoint-with-query", "missing-ingestion-version", "generic-headers", "no-endpoint"],
)
def test_invalid_destination_stops_before_any_request_without_echoing_values(
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
    environ: Mapping[str, str],
    named_variable: str,
) -> None:
    _forbid_app_construction(monkeypatch)

    run = _run_smoke(capsys, environ=environ)

    assert run.received == []
    assert run.exit_message is not None
    assert named_variable in run.exit_message
    assert "SECRETQ" not in run.output
    _assert_nothing_sensitive(run)


def test_rejected_export_is_reported_once_without_an_automatic_rerun(
    capsys: pytest.CaptureFixture[str],
) -> None:
    run = _run_smoke(capsys, status=HTTPStatus.UNAUTHORIZED)

    assert run.exit_message is not None
    assert run.exit_message.startswith("Smoke failed: not every OTLP export call was acknowledged")
    assert "not retried automatically" in run.exit_message
    assert run.received
    assert len(run.spans) == EXPECTED_OBSERVATIONS
    assert f"{len(run.received)} (0 acknowledged with HTTP 2xx," in run.output
    assert "200, 200, 200" in run.output
    assert "4 of 4" in run.output
    assert len(TRACE_ID_PATTERN.findall(run.output)) == len(EXPECTED_TRACE_SIZES)
    _assert_nothing_sensitive(run)


@pytest.mark.anyio
async def test_synthetic_provider_fails_closed_after_its_script() -> None:
    provider = SyntheticModelProvider(
        [SyntheticReply(interpreted_intent_payload(), synthetic_usage(1, 1))]
    )
    request = ModelIntentRequest(
        prompt_version="v", system_prompt="s", user_prompt="u", output=ModelOutputSpec("o", dict)
    )

    first = await provider.generate_intent(request)
    with pytest.raises(ModelUnavailableError):
        await provider.generate_intent(request)

    assert first.model == SYNTHETIC_RESPONSE_MODEL
    assert provider.calls == 1
