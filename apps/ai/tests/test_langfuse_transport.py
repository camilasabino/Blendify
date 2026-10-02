import base64
import logging
import threading
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import cast

import pytest
from fastapi.testclient import TestClient
from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import ExportTraceServiceRequest
from opentelemetry.proto.common.v1.common_pb2 import KeyValue
from opentelemetry.proto.trace.v1.trace_pb2 import ScopeSpans
from opentelemetry.proto.trace.v1.trace_pb2 import Span as ProtoSpan
from opentelemetry.proto.trace.v1.trace_pb2 import Status as ProtoStatus
from opentelemetry.sdk.trace import ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import SpanKind

from app.config.settings import Settings
from app.main import create_app
from app.observability.langfuse_mapping import LANGFUSE_DESTINATION_ATTRIBUTES
from app.observability.span_privacy import EXPORTABLE_SPAN_ATTRIBUTES
from app.observability.telemetry_config import load_telemetry_config
from app.observability.telemetry_runtime import (
    SHUTDOWN_EXPORT_WINDOW_SECONDS,
    TelemetryRuntime,
    build_telemetry_runtime,
)
from app.prompts.intent import INTENT_PROMPT_VERSION
from app.prompts.refinement import REFINEMENT_PROMPT_VERSION
from app.providers.model_provider import (
    IntentModelProvider,
    ModelInvocationMetadata,
    ModelTimeoutError,
)
from tests.conftest import AUTH_HEADERS, SERVICE_TOKEN
from tests.fakes import (
    FAKE_GEN_AI_OPERATION,
    FAKE_GEN_AI_PROVIDER,
    FAKE_MODEL,
    FAKE_REQUEST_MODEL,
    FAKE_USAGE,
    ScriptedModelProvider,
    current_intent,
    empty_preservation,
    interpreted_output,
    refinement_output,
)
from tests.telemetry_fakes import (
    FAKE_LANGFUSE_BASIC_CREDENTIALS,
    FAKE_LANGFUSE_PUBLIC_KEY,
    FAKE_LANGFUSE_SECRET_KEY,
    FAKE_LANGFUSE_SECRETS,
    LOOPBACK_HOST,
    ReceivedExport,
    langfuse_otlp_environ,
    loopback_otlp_receiver,
    record_spans,
)

INTERPRET_ROUTE = "/v1/intent/interpret"
REFINEMENT_ROUTE = "/v1/refinement/plan"
OTLP_TIMEOUT = "2"
BATCH_WORKER_THREAD = "OtelBatchSpanRecordProcessor"
HTTP_CLIENT_HEADERS = frozenset({"host", "content-length", "accept-encoding", "user-agent"})
WINDOW_LOGGER = "app.observability.span_export_safety"
TYPE = "langfuse.observation.type"
MODEL = "langfuse.observation.model.name"
METADATA = "langfuse.observation.metadata."
REQUEST_ID = "3f1c2a9e-7b4d-4e8a-9c1f-2d6b5e8a7c30"
UPSTREAM_TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736"
UPSTREAM_SPAN_ID = "00f067aa0ba902b7"
PROMPT_SENTINEL = "LANGFUSE_TRANSPORT_PROMPT_SENTINEL"
OUTPUT_SENTINEL = "LANGFUSE_TRANSPORT_OUTPUT_SENTINEL"
USER_AGENT_SENTINEL = "LANGFUSE_TRANSPORT_USER_AGENT_SENTINEL"
BAGGAGE_SENTINEL = "LANGFUSE_TRANSPORT_BAGGAGE_SENTINEL"
CONTENT_SENTINELS = (PROMPT_SENTINEL, OUTPUT_SENTINEL, USER_AGENT_SENTINEL, BAGGAGE_SENTINEL)
SECRETS = (*FAKE_LANGFUSE_SECRETS, SERVICE_TOKEN)
EXPECTED_RESOURCE = {"service.name": "blendify-ai", "deployment.environment.name": "development"}
ALLOWED_KEYS = EXPORTABLE_SPAN_ATTRIBUTES | LANGFUSE_DESTINATION_ATTRIBUTES
PROTO_KINDS = {
    SpanKind.SERVER: ProtoSpan.SpanKind.SPAN_KIND_SERVER,
    SpanKind.INTERNAL: ProtoSpan.SpanKind.SPAN_KIND_INTERNAL,
    SpanKind.CLIENT: ProtoSpan.SpanKind.SPAN_KIND_CLIENT,
}
UNSET = ProtoStatus.StatusCode.STATUS_CODE_UNSET
ERROR = ProtoStatus.StatusCode.STATUS_CODE_ERROR

Call = tuple[str, Mapping[str, object], Mapping[str, str]]


@dataclass(frozen=True, slots=True)
class ExportedSpan:
    span: ProtoSpan
    resource: Mapping[str, object]
    scope: tuple[str, str]

    @property
    def attributes(self) -> dict[str, object]:
        return _values(self.span.attributes)


@dataclass(frozen=True, slots=True)
class ExportedTrace:
    server: ExportedSpan
    use_case: ExportedSpan
    generations: list[ExportedSpan]


@dataclass(frozen=True, slots=True)
class LoopbackExport:
    received: list[ReceivedExport]
    unfiltered: tuple[ReadableSpan, ...]
    statuses: list[int]

    @property
    def spans(self) -> list[ExportedSpan]:
        return [
            ExportedSpan(span, _values(resource_spans.resource.attributes), _scope(scope_spans))
            for export in self.received
            for resource_spans in ExportTraceServiceRequest.FromString(export.body).resource_spans
            for scope_spans in resource_spans.scope_spans
            for span in scope_spans.spans
        ]


class UnreportedMetadataProvider(ScriptedModelProvider):
    @property
    def invocation_metadata(self) -> ModelInvocationMetadata | None:
        return ModelInvocationMetadata(
            provider_name=FAKE_GEN_AI_PROVIDER,
            operation_name=FAKE_GEN_AI_OPERATION,
            request_model=None,
        )


def _values(attributes: Iterable[KeyValue]) -> dict[str, object]:
    values: dict[str, object] = {}
    for item in attributes:
        field = item.value.WhichOneof("value")
        values[item.key] = getattr(item.value, field) if field else None
    return values


def _scope(scope_spans: ScopeSpans) -> tuple[str, str]:
    return scope_spans.scope.name, scope_spans.scope.version


def _langfuse_runtime(port: int) -> TelemetryRuntime:
    return build_telemetry_runtime(
        load_telemetry_config(langfuse_otlp_environ(port, OTLP_TIMEOUT)), "development"
    )


def _interpret_call(**headers: str) -> Call:
    return INTERPRET_ROUTE, {"prompt": f"{PROMPT_SENTINEL} Radiohead"}, headers


def _refine_call() -> Call:
    body = {
        "intent": current_intent(),
        "preservation": empty_preservation(),
        "refinement": PROMPT_SENTINEL,
    }
    return REFINEMENT_ROUTE, body, {}


def _export_through_loopback(
    settings: Settings, provider: IntentModelProvider | None, calls: Sequence[Call]
) -> LoopbackExport:
    with loopback_otlp_receiver() as (port, received):
        runtime = _langfuse_runtime(port)
        unfiltered = InMemorySpanExporter()
        sdk_provider = cast(TracerProvider, runtime.tracer_provider)
        sdk_provider.add_span_processor(SimpleSpanProcessor(unfiltered))
        app = create_app(settings, provider, telemetry=runtime)
        with TestClient(app, raise_server_exceptions=False) as client:
            statuses = [
                client.post(route, json=body, headers={**AUTH_HEADERS, **headers}).status_code
                for route, body, headers in calls
            ]
    return LoopbackExport(list(received), unfiltered.get_finished_spans(), statuses)


def _traces(spans: Sequence[ExportedSpan]) -> list[ExportedTrace]:
    by_trace: dict[bytes, list[ExportedSpan]] = {}
    for span in spans:
        by_trace.setdefault(span.span.trace_id, []).append(span)

    traces = []
    for members in by_trace.values():
        (server,) = _of_kind(members, ProtoSpan.SpanKind.SPAN_KIND_SERVER)
        (use_case,) = _of_kind(members, ProtoSpan.SpanKind.SPAN_KIND_INTERNAL)
        generations = _of_kind(members, ProtoSpan.SpanKind.SPAN_KIND_CLIENT)
        traces.append(ExportedTrace(server, use_case, generations))
    return sorted(traces, key=lambda trace: trace.server.span.start_time_unix_nano)


def _of_kind(spans: Iterable[ExportedSpan], kind: int) -> list[ExportedSpan]:
    return sorted(
        (span for span in spans if span.span.kind == kind),
        key=lambda span: span.span.start_time_unix_nano,
    )


def _destination(span: ExportedSpan) -> dict[str, object]:
    return {key: value for key, value in span.attributes.items() if key.startswith("langfuse.")}


def _has_usage_or_cost(span: ExportedSpan) -> bool:
    return any("usage" in key or "cost" in key or "token" in key for key in span.attributes)


def _logged_text(caplog: pytest.LogCaptureFixture) -> str:
    return caplog.text + "\n".join(record.getMessage() for record in caplog.records)


def test_export_request_targets_the_langfuse_traces_endpoint_with_basic_auth_and_v4(
    settings: Settings,
) -> None:
    export = _export_through_loopback(
        settings, ScriptedModelProvider([interpreted_output()]), [_interpret_call()]
    )

    assert export.statuses == [200]
    assert export.received
    for request in export.received:
        scheme, _space, credentials = request.headers["authorization"].partition(" ")
        assert request.method == "POST"
        assert request.path == "/api/public/otel/v1/traces"
        assert request.headers["content-type"] == "application/x-protobuf"
        assert request.headers["x-langfuse-ingestion-version"] == "4"
        assert set(request.headers) - HTTP_CLIENT_HEADERS == {
            "authorization",
            "content-type",
            "x-langfuse-ingestion-version",
        }
        assert scheme == "Basic"
        assert credentials == FAKE_LANGFUSE_BASIC_CREDENTIALS
        assert base64.b64decode(credentials, validate=True).decode() == (
            f"{FAKE_LANGFUSE_PUBLIC_KEY}:{FAKE_LANGFUSE_SECRET_KEY}"
        )
        ExportTraceServiceRequest.FromString(request.body)


def test_runtime_payload_keeps_hierarchy_identity_models_and_per_attempt_usage(
    settings: Settings, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    provider = ScriptedModelProvider(
        [
            interpreted_output(artists=[OUTPUT_SENTINEL]),
            refinement_output(),
            {"outcome": "invalid"},
            interpreted_output(),
        ]
    )

    export = _export_through_loopback(
        settings,
        provider,
        [
            _interpret_call(
                **{
                    "X-Request-Id": REQUEST_ID,
                    "traceparent": f"00-{UPSTREAM_TRACE_ID}-{UPSTREAM_SPAN_ID}-01",
                    "baggage": f"langfuse.user.id={BAGGAGE_SENTINEL},user.id={BAGGAGE_SENTINEL}",
                    "User-Agent": USER_AGENT_SENTINEL,
                }
            ),
            _refine_call(),
            _interpret_call(),
        ],
    )

    traces = _traces(export.spans)
    interpretation, refinement, recovered = traces
    assert export.statuses == [200, 200, 200]
    assert len(provider.requests) == 4
    assert len({request.body for request in export.received}) == len(export.received)
    assert len(export.spans) == 10
    assert [len(trace.generations) for trace in traces] == [1, 1, 2]
    assert interpretation.server.span.trace_id == bytes.fromhex(UPSTREAM_TRACE_ID)
    assert interpretation.server.span.parent_span_id == bytes.fromhex(UPSTREAM_SPAN_ID)
    assert interpretation.server.attributes["blendify.request_id"] == REQUEST_ID
    assert refinement.server.span.parent_span_id == b""
    assert recovered.server.span.parent_span_id == b""

    expected_operations = [
        ("intent_interpretation", INTENT_PROMPT_VERSION),
        ("refinement_interpretation", REFINEMENT_PROMPT_VERSION),
        ("intent_interpretation", INTENT_PROMPT_VERSION),
    ]
    for trace, (operation, prompt_version) in zip(traces, expected_operations, strict=True):
        _assert_hierarchy(trace)
        assert _destination(trace.server) == {TYPE: "span"}
        assert trace.server.attributes["http.status_code"] == 200
        assert _destination(trace.use_case) == {
            TYPE: "span",
            f"{METADATA}operation": operation,
            f"{METADATA}prompt_version": prompt_version,
            f"{METADATA}result": "completed",
            f"{METADATA}outcome": "interpreted",
        }
        assert trace.use_case.span.status.code == UNSET
        for attempt, generation in enumerate(trace.generations, start=1):
            attributes = generation.attributes
            assert attributes[TYPE] == "generation"
            assert attributes[MODEL] == FAKE_MODEL
            assert attributes["gen_ai.request.model"] == FAKE_REQUEST_MODEL
            assert attributes["gen_ai.response.model"] == FAKE_MODEL
            assert attributes["gen_ai.usage.input_tokens"] == FAKE_USAGE.input_tokens
            assert attributes["gen_ai.usage.output_tokens"] == FAKE_USAGE.output_tokens
            assert attributes[f"{METADATA}operation"] == operation
            assert attributes[f"{METADATA}prompt_version"] == prompt_version
            assert attributes[f"{METADATA}provider"] == FAKE_GEN_AI_PROVIDER
            assert attributes[f"{METADATA}attempt"] == str(attempt)

    failed, succeeded = recovered.generations
    assert failed.span.status.code == ERROR
    assert failed.attributes[f"{METADATA}result"] == "invalid_output"
    assert failed.attributes[f"{METADATA}error_type"] == "invalid_output"
    assert succeeded.span.status.code == UNSET
    assert succeeded.attributes[f"{METADATA}result"] == "ok"
    assert f"{METADATA}error_type" not in succeeded.attributes

    generations = [generation for trace in traces for generation in trace.generations]
    assert [span for span in export.spans if _has_usage_or_cost(span)] == generations
    assert sum(span.attributes.get("gen_ai.usage.input_tokens", 0) for span in export.spans) == (
        len(generations) * FAKE_USAGE.input_tokens
    )

    _assert_identity_preserved(export)
    _assert_payload_safe(export)
    assert any(
        USER_AGENT_SENTINEL in str(dict(span.attributes or {})) for span in export.unfiltered
    )
    logged = _logged_text(caplog)
    for sentinel in (*CONTENT_SENTINELS, *SECRETS, LOOPBACK_HOST):
        assert sentinel not in logged


def test_unreported_model_and_usage_are_not_invented(settings: Settings) -> None:
    provider = UnreportedMetadataProvider(
        [ModelTimeoutError("timed out"), interpreted_output()], usage=None
    )

    export = _export_through_loopback(settings, provider, [_interpret_call(), _interpret_call()])

    timed_out, completed = _traces(export.spans)
    (unknown_model,) = timed_out.generations
    (reported_model,) = completed.generations
    assert export.statuses == [504, 200]
    assert unknown_model.attributes[TYPE] == "generation"
    assert unknown_model.span.status.code == ERROR
    assert not any("model" in key for key in unknown_model.attributes)
    assert reported_model.attributes[MODEL] == FAKE_MODEL
    assert reported_model.attributes["gen_ai.response.model"] == FAKE_MODEL
    assert "gen_ai.request.model" not in reported_model.attributes
    assert not any(_has_usage_or_cost(span) for span in export.spans)
    _assert_identity_preserved(export)
    _assert_payload_safe(export)


def test_path_without_a_model_invocation_exports_no_generation(settings: Settings) -> None:
    export = _export_through_loopback(settings, None, [_interpret_call()])

    (trace,) = _traces(export.spans)
    assert export.statuses == [503]
    assert trace.generations == []
    assert [span.attributes[TYPE] for span in export.spans] == ["span", "span"]
    assert trace.use_case.attributes[f"{METADATA}error_code"] == "MODEL_UNAVAILABLE"
    for span in export.spans:
        assert not _has_usage_or_cost(span)
        assert not any("model" in key for key in span.attributes)
    _assert_payload_safe(export)


def test_langfuse_otlp_export_runs_on_the_single_batch_worker(settings: Settings) -> None:
    with loopback_otlp_receiver() as (port, received):
        runtime = _langfuse_runtime(port)
        before = set(threading.enumerate())
        runtime.start()
        started = set(threading.enumerate()) - before
        app = create_app(settings, ScriptedModelProvider([interpreted_output()]), telemetry=runtime)
        with TestClient(app) as client:
            client.post(INTERPRET_ROUTE, json={"prompt": "Radiohead"}, headers=AUTH_HEADERS)
        still_running = started & set(threading.enumerate())

    assert [thread.name for thread in started] == [BATCH_WORKER_THREAD]
    assert still_running == set()
    assert received


def test_shutdown_window_drops_late_batches_before_they_reach_the_transport(
    caplog: pytest.LogCaptureFixture,
) -> None:
    readings = iter([0.0])

    with loopback_otlp_receiver() as (port, received):
        runtime = build_telemetry_runtime(
            load_telemetry_config(langfuse_otlp_environ(port, OTLP_TIMEOUT)),
            "development",
            clock=lambda: next(readings, SHUTDOWN_EXPORT_WINDOW_SECONDS),
        )
        runtime.start()
        record_spans(runtime, 1)
        with caplog.at_level(logging.WARNING, logger=WINDOW_LOGGER):
            runtime.shutdown()

    assert received == []
    assert "Dropped 1 spans that could not start exporting within 1 s of shutdown" in caplog.text


def _assert_hierarchy(trace: ExportedTrace) -> None:
    assert trace.use_case.span.parent_span_id == trace.server.span.span_id
    _assert_within(trace.use_case, trace.server)
    for generation in trace.generations:
        assert generation.span.parent_span_id == trace.use_case.span.span_id
        _assert_within(generation, trace.use_case)


def _assert_within(child: ExportedSpan, parent: ExportedSpan) -> None:
    assert parent.span.start_time_unix_nano <= child.span.start_time_unix_nano
    assert child.span.start_time_unix_nano <= child.span.end_time_unix_nano
    assert child.span.end_time_unix_nano <= parent.span.end_time_unix_nano


def _assert_identity_preserved(export: LoopbackExport) -> None:
    originals = {span.context.span_id: span for span in export.unfiltered}
    assert len(export.spans) == len(originals)
    for exported in export.spans:
        original = originals[int.from_bytes(exported.span.span_id, "big")]
        parent = original.parent
        scope = original.instrumentation_scope
        assert exported.span.trace_id == original.context.trace_id.to_bytes(16, "big")
        assert exported.span.parent_span_id == (
            parent.span_id.to_bytes(8, "big") if parent is not None else b""
        )
        assert exported.span.name == original.name
        assert exported.span.kind == PROTO_KINDS[original.kind]
        assert exported.span.start_time_unix_nano == original.start_time
        assert exported.span.end_time_unix_nano == original.end_time
        assert exported.span.status.code == original.status.status_code.value
        assert scope is not None
        assert exported.scope == (scope.name, scope.version or "")


def _assert_payload_safe(export: LoopbackExport) -> None:
    for exported in export.spans:
        assert set(exported.attributes) <= ALLOWED_KEYS
        assert exported.resource == EXPECTED_RESOURCE
        assert list(exported.span.events) == []
        assert all(not link.attributes for link in exported.span.links)
        assert exported.span.status.message == ""
    for request in export.received:
        for sentinel in (*CONTENT_SENTINELS, *SECRETS):
            assert sentinel.encode() not in request.body
