import base64
import threading
from collections.abc import Mapping, Sequence
from typing import cast

import pytest
from fastapi.testclient import TestClient
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.common.trace_encoder import encode_spans
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import Event, ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor, SpanExporter, SpanExportResult
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.sdk.util.instrumentation import InstrumentationScope
from opentelemetry.trace import (
    Link,
    SpanContext,
    SpanKind,
    Status,
    StatusCode,
    TraceFlags,
    format_span_id,
    format_trace_id,
)
from opentelemetry.util.types import AttributeValue

from app.config.settings import Settings
from app.main import create_app
from app.observability import langfuse_mapping
from app.observability.langfuse_mapping import (
    LANGFUSE_DESTINATION_ATTRIBUTES,
    LangfuseSpanExporter,
    langfuse_observation,
)
from app.observability.span_privacy import EXPORTABLE_SPAN_ATTRIBUTES
from app.observability.telemetry_config import load_telemetry_config
from app.observability.telemetry_runtime import TelemetryRuntime, build_telemetry_runtime
from app.prompts.intent import INTENT_PROMPT_VERSION
from app.prompts.refinement import REFINEMENT_PROMPT_VERSION
from app.providers.model_provider import IntentModelProvider
from tests.conftest import AUTH_HEADERS
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

TYPE = "langfuse.observation.type"
MODEL = "langfuse.observation.model.name"
METADATA = "langfuse.observation.metadata."
REQUEST_ID = "3f1c2a9e-7b4d-4e8a-9c1f-2d6b5e8a7c30"
UPSTREAM_TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736"
UPSTREAM_SPAN_ID = "00f067aa0ba902b7"
SENTINEL = "LANGFUSE_MAPPING_SENTINEL"
FAKE_AUTH = base64.b64encode(b"pk-lf-fake-public:sk-lf-fake-secret").decode()
GENERIC = {"OTEL_SDK_DISABLED": "false"}
LANGFUSE = {
    **GENERIC,
    "AI_TELEMETRY_BACKEND": "langfuse",
    "OTEL_TRACES_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": "http://127.0.0.1:9/api/public/otel/v1/traces",
    "OTEL_EXPORTER_OTLP_TRACES_HEADERS": (
        f"Authorization=Basic%20{FAKE_AUTH},x-langfuse-ingestion-version=4"
    ),
}
RESOURCE = Resource({"service.name": "blendify-ai", "deployment.environment.name": "development"})
SCOPE = InstrumentationScope("blendify.ai", "1.0.0")
ALLOWED_KEYS = EXPORTABLE_SPAN_ATTRIBUTES | LANGFUSE_DESTINATION_ATTRIBUTES


class Telemetry:
    def __init__(self, environ: Mapping[str, str] = LANGFUSE) -> None:
        self.exporter = InMemorySpanExporter()
        self.unfiltered = InMemorySpanExporter()
        self.runtime: TelemetryRuntime = build_telemetry_runtime(
            load_telemetry_config(environ), "development", span_exporter=self.exporter
        )
        sdk_provider = cast(TracerProvider, self.runtime.tracer_provider)
        sdk_provider.add_span_processor(SimpleSpanProcessor(self.unfiltered))

    @property
    def spans(self) -> tuple[ReadableSpan, ...]:
        return self.exporter.get_finished_spans()

    def of_kind(self, kind: SpanKind) -> list[ReadableSpan]:
        return sorted(
            (span for span in self.spans if span.kind is kind),
            key=lambda span: span.start_time or 0,
        )

    def only(self, kind: SpanKind) -> ReadableSpan:
        (span,) = self.of_kind(kind)
        return span

    def serialized(self) -> bytes:
        return encode_spans(self.spans).SerializeToString()


def _context(span_id: int, trace_id: int = 0xA1) -> SpanContext:
    return SpanContext(
        trace_id=trace_id,
        span_id=span_id,
        is_remote=False,
        trace_flags=TraceFlags(TraceFlags.SAMPLED),
    )


def _span(
    kind: SpanKind,
    attributes: Mapping[str, AttributeValue],
    *,
    name: str = "span",
    events: Sequence[Event] = (),
    links: Sequence[Link] = (),
    status: Status | None = None,
) -> ReadableSpan:
    return ReadableSpan(
        name=name,
        context=_context(0xB2),
        parent=_context(0xC3),
        resource=RESOURCE,
        attributes=attributes,
        events=events,
        links=links,
        kind=kind,
        status=status or Status(StatusCode.UNSET),
        start_time=1_000,
        end_time=2_000,
        instrumentation_scope=SCOPE,
    )


def _attributes(span: ReadableSpan) -> dict[str, object]:
    return dict(span.attributes or {})


def _destination(span: ReadableSpan) -> dict[str, object]:
    return {key: value for key, value in _attributes(span).items() if key.startswith("langfuse.")}


def _model_attributes(**overrides: AttributeValue) -> dict[str, AttributeValue]:
    attributes: dict[str, AttributeValue] = {
        "gen_ai.provider.name": FAKE_GEN_AI_PROVIDER,
        "gen_ai.operation.name": FAKE_GEN_AI_OPERATION,
        "gen_ai.request.model": FAKE_REQUEST_MODEL,
        "gen_ai.response.model": FAKE_MODEL,
        "gen_ai.usage.input_tokens": FAKE_USAGE.input_tokens,
        "gen_ai.usage.output_tokens": FAKE_USAGE.output_tokens,
        "blendify.ai.operation": "intent_interpretation",
        "blendify.ai.prompt.version": INTENT_PROMPT_VERSION,
        "blendify.ai.attempt": 1,
        "blendify.ai.result": "ok",
    }
    attributes.update(overrides)
    return attributes


def _post(
    settings: Settings,
    provider: IntentModelProvider | None,
    telemetry: Telemetry,
    route: str,
    body: Mapping[str, object],
    **headers: str,
) -> int:
    app = create_app(settings, provider, telemetry=telemetry.runtime)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(route, json=body, headers={**AUTH_HEADERS, **headers})
    return response.status_code


def _interpret(
    settings: Settings, provider: IntentModelProvider | None, telemetry: Telemetry, **headers: str
) -> int:
    body = {"prompt": f"{SENTINEL} Radiohead"}
    return _post(settings, provider, telemetry, "/v1/intent/interpret", body, **headers)


def _refine(settings: Settings, provider: IntentModelProvider, telemetry: Telemetry) -> int:
    body = {
        "intent": current_intent(),
        "preservation": empty_preservation(),
        "refinement": SENTINEL,
    }
    return _post(settings, provider, telemetry, "/v1/refinement/plan", body)


def test_request_and_use_case_spans_are_explicit_span_observations() -> None:
    server = langfuse_observation(
        _span(SpanKind.SERVER, {"http.method": "POST", "blendify.request_id": REQUEST_ID})
    )
    use_case = langfuse_observation(
        _span(
            SpanKind.INTERNAL,
            {
                "blendify.ai.operation": "intent_interpretation",
                "blendify.ai.prompt.version": INTENT_PROMPT_VERSION,
                "blendify.ai.result": "failed",
                "blendify.ai.error_code": "MODEL_TIMEOUT",
                "error.type": "MODEL_TIMEOUT",
                "gen_ai.request.model": FAKE_REQUEST_MODEL,
            },
        )
    )

    assert _destination(server) == {TYPE: "span"}
    assert _attributes(server)["blendify.request_id"] == REQUEST_ID
    assert _destination(use_case) == {
        TYPE: "span",
        f"{METADATA}operation": "intent_interpretation",
        f"{METADATA}prompt_version": INTENT_PROMPT_VERSION,
        f"{METADATA}result": "failed",
        f"{METADATA}error_code": "MODEL_TIMEOUT",
        f"{METADATA}error_type": "MODEL_TIMEOUT",
    }


def test_model_invocation_is_a_generation_with_the_reported_model() -> None:
    generation = langfuse_observation(_span(SpanKind.CLIENT, _model_attributes()))

    assert _destination(generation) == {
        TYPE: "generation",
        MODEL: FAKE_MODEL,
        f"{METADATA}operation": "intent_interpretation",
        f"{METADATA}prompt_version": INTENT_PROMPT_VERSION,
        f"{METADATA}provider": FAKE_GEN_AI_PROVIDER,
        f"{METADATA}attempt": "1",
        f"{METADATA}result": "ok",
    }
    assert _attributes(generation)["gen_ai.request.model"] == FAKE_REQUEST_MODEL
    assert _attributes(generation)["gen_ai.usage.input_tokens"] == FAKE_USAGE.input_tokens
    assert _attributes(generation)["gen_ai.usage.output_tokens"] == FAKE_USAGE.output_tokens


def test_generation_falls_back_to_the_requested_model_and_never_invents_one() -> None:
    requested = langfuse_observation(
        _span(SpanKind.CLIENT, _model_attributes(**{"gen_ai.response.model": ""}))
    )
    unknown = _model_attributes()
    del unknown["gen_ai.request.model"], unknown["gen_ai.response.model"]
    without_model = langfuse_observation(_span(SpanKind.CLIENT, unknown))

    assert _attributes(requested)[MODEL] == FAKE_REQUEST_MODEL
    assert _attributes(without_model)[TYPE] == "generation"
    assert MODEL not in _attributes(without_model)


def test_missing_usage_stays_unknown() -> None:
    attributes = _model_attributes()
    del attributes["gen_ai.usage.input_tokens"], attributes["gen_ai.usage.output_tokens"]

    generation = _attributes(langfuse_observation(_span(SpanKind.CLIENT, attributes)))

    assert not any("usage" in key or "cost" in key for key in generation)


def test_client_span_without_a_model_operation_is_a_plain_span() -> None:
    span = langfuse_observation(_span(SpanKind.CLIENT, {"gen_ai.request.model": FAKE_MODEL}))

    assert _destination(span) == {TYPE: "span"}


@pytest.mark.parametrize(
    "value",
    [True, 1.5, "has space", "x" * 65, "ñ", "", ("tuple",)],
)
def test_metadata_values_must_be_bounded_scalars(value: AttributeValue) -> None:
    span = langfuse_observation(_span(SpanKind.INTERNAL, {"blendify.ai.outcome": value}))

    assert _destination(span) == {TYPE: "span"}


def test_mapping_preserves_identity_and_does_not_mutate_the_input() -> None:
    attributes = _model_attributes(**{"http.url": f"https://x.test/?q={SENTINEL}"})
    original = _span(
        SpanKind.CLIENT,
        attributes,
        name="chat fake-model-alias",
        status=Status(StatusCode.ERROR, SENTINEL),
    )
    snapshot = dict(original.attributes or {})

    mapped = langfuse_observation(original)

    assert mapped is not original
    assert dict(original.attributes or {}) == snapshot
    assert original.status.description == SENTINEL
    assert (mapped.name, mapped.kind, mapped.start_time, mapped.end_time) == (
        original.name,
        original.kind,
        original.start_time,
        original.end_time,
    )
    assert mapped.context == original.context
    assert mapped.parent == original.parent
    assert mapped.resource is original.resource
    assert mapped.instrumentation_scope == original.instrumentation_scope
    assert mapped.status.status_code is StatusCode.ERROR


def test_mapping_is_idempotent() -> None:
    once = langfuse_observation(_span(SpanKind.CLIENT, _model_attributes()))
    twice = langfuse_observation(once)

    assert _attributes(twice) == _attributes(once)
    assert twice.context == once.context
    assert twice.parent == once.parent


def test_unmapped_and_destination_lookalike_attributes_never_reach_the_destination() -> None:
    hostile = _span(
        SpanKind.SERVER,
        {
            "http.method": "POST",
            "http.url": f"https://x.test/?q={SENTINEL}",
            "gen_ai.prompt": SENTINEL,
            "langfuse.observation.type": "generation",
            "langfuse.observation.input": SENTINEL,
            "langfuse.observation.metadata.user": SENTINEL,
            "langfuse.user.id": SENTINEL,
            "langfuse.environment": SENTINEL,
            "user.id": SENTINEL,
        },
        events=[Event("exception", {"exception.message": SENTINEL})],
        links=[Link(_context(0xD4), {"link.secret": SENTINEL})],
        status=Status(StatusCode.ERROR, SENTINEL),
    )

    mapped = langfuse_observation(hostile)
    serialized = encode_spans([mapped]).SerializeToString()

    assert _attributes(mapped) == {"http.method": "POST", TYPE: "span"}
    assert mapped.events == ()
    assert [dict(link.attributes or {}) for link in mapped.links] == [{}]
    assert mapped.status.description is None
    assert SENTINEL.encode() not in serialized


def test_exporter_delegates_lifecycle_and_results() -> None:
    class RecordingExporter(SpanExporter):
        def __init__(self) -> None:
            self.batches: list[Sequence[ReadableSpan]] = []
            self.shutdowns = 0

        def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
            self.batches.append(spans)
            return SpanExportResult.FAILURE

        def shutdown(self) -> None:
            self.shutdowns += 1

        def force_flush(self, timeout_millis: int = 30000) -> bool:
            return False

    inner = RecordingExporter()
    exporter = LangfuseSpanExporter(inner)

    assert exporter.export([_span(SpanKind.SERVER, {})]) is SpanExportResult.FAILURE
    assert exporter.force_flush() is False
    exporter.shutdown()
    ((span,),) = inner.batches
    assert _attributes(span) == {TYPE: "span"}
    assert inner.shutdowns == 1


def test_interpretation_maps_three_observations_with_preserved_hierarchy(
    settings: Settings,
) -> None:
    telemetry = Telemetry()
    provider = ScriptedModelProvider([interpreted_output(artists=[SENTINEL])])

    status = _interpret(
        settings,
        provider,
        telemetry,
        **{
            "X-Request-Id": REQUEST_ID,
            "traceparent": f"00-{UPSTREAM_TRACE_ID}-{UPSTREAM_SPAN_ID}-01",
            "baggage": f"langfuse.user.id={SENTINEL},user.id={SENTINEL},session.id={SENTINEL}",
        },
    )

    server = telemetry.only(SpanKind.SERVER)
    use_case = telemetry.only(SpanKind.INTERNAL)
    generation = telemetry.only(SpanKind.CLIENT)
    assert status == 200
    assert len(telemetry.spans) == 3
    assert format_trace_id(server.context.trace_id) == UPSTREAM_TRACE_ID
    assert server.parent is not None and format_span_id(server.parent.span_id) == UPSTREAM_SPAN_ID
    assert use_case.parent is not None and use_case.parent.span_id == server.context.span_id
    assert generation.parent is not None
    assert generation.parent.span_id == use_case.context.span_id

    assert _destination(server) == {TYPE: "span"}
    assert _destination(use_case) == {
        TYPE: "span",
        f"{METADATA}operation": "intent_interpretation",
        f"{METADATA}prompt_version": INTENT_PROMPT_VERSION,
        f"{METADATA}result": "completed",
        f"{METADATA}outcome": "interpreted",
    }
    assert _destination(generation) == {
        TYPE: "generation",
        MODEL: FAKE_MODEL,
        f"{METADATA}operation": "intent_interpretation",
        f"{METADATA}prompt_version": INTENT_PROMPT_VERSION,
        f"{METADATA}provider": FAKE_GEN_AI_PROVIDER,
        f"{METADATA}attempt": "1",
        f"{METADATA}result": "ok",
    }
    _assert_mapped_from_unfiltered_spans(telemetry)
    _assert_destination_safe(telemetry)


def test_recovered_retry_keeps_the_failed_generation_and_per_attempt_usage(
    settings: Settings,
) -> None:
    telemetry = Telemetry()
    provider = ScriptedModelProvider([{"outcome": "invalid"}, refinement_output()])

    status = _refine(settings, provider, telemetry)

    use_case = telemetry.only(SpanKind.INTERNAL)
    first, second = telemetry.of_kind(SpanKind.CLIENT)
    assert status == 200
    assert len(telemetry.spans) == 4
    assert _destination(use_case) == {
        TYPE: "span",
        f"{METADATA}operation": "refinement_interpretation",
        f"{METADATA}prompt_version": REFINEMENT_PROMPT_VERSION,
        f"{METADATA}result": "completed",
        f"{METADATA}outcome": "interpreted",
    }
    assert use_case.status.status_code is StatusCode.UNSET
    assert first.status.status_code is StatusCode.ERROR
    assert _destination(first)[f"{METADATA}result"] == "invalid_output"
    assert _destination(first)[f"{METADATA}error_type"] == "invalid_output"
    assert _destination(first)[f"{METADATA}attempt"] == "1"
    assert second.status.status_code is StatusCode.UNSET
    assert _destination(second)[f"{METADATA}result"] == "ok"
    assert _destination(second)[f"{METADATA}attempt"] == "2"
    assert f"{METADATA}error_type" not in _destination(second)
    for generation in (first, second):
        assert _attributes(generation)[TYPE] == "generation"
        assert _attributes(generation)["gen_ai.usage.input_tokens"] == FAKE_USAGE.input_tokens
        assert _attributes(generation)["gen_ai.usage.output_tokens"] == FAKE_USAGE.output_tokens
    for span in (use_case, telemetry.only(SpanKind.SERVER)):
        assert not any("usage" in key for key in _attributes(span))
    _assert_mapped_from_unfiltered_spans(telemetry)
    _assert_destination_safe(telemetry)


def test_path_without_a_model_invocation_has_no_generation(settings: Settings) -> None:
    telemetry = Telemetry()

    status = _interpret(settings, None, telemetry)

    use_case = telemetry.only(SpanKind.INTERNAL)
    assert status == 503
    assert telemetry.of_kind(SpanKind.CLIENT) == []
    assert [_attributes(span)[TYPE] for span in telemetry.spans] == ["span", "span"]
    assert _destination(use_case)[f"{METADATA}error_code"] == "MODEL_UNAVAILABLE"
    assert MODEL not in _attributes(use_case)
    _assert_destination_safe(telemetry)


def test_generation_without_reported_usage_has_no_usage(settings: Settings) -> None:
    telemetry = Telemetry()
    provider = ScriptedModelProvider([interpreted_output()], usage=None)

    _interpret(settings, provider, telemetry)

    generation = _attributes(telemetry.only(SpanKind.CLIENT))
    assert generation[TYPE] == "generation"
    assert not any("usage" in key or "cost" in key for key in generation)


def test_mapping_only_receives_privacy_filtered_copies(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    received: list[ReadableSpan] = []

    def recording_observation(span: ReadableSpan) -> ReadableSpan:
        received.append(span)
        return langfuse_observation(span)

    monkeypatch.setattr(langfuse_mapping, "langfuse_observation", recording_observation)
    telemetry = Telemetry()

    _interpret(
        settings,
        ScriptedModelProvider([interpreted_output()]),
        telemetry,
        **{"User-Agent": SENTINEL, "baggage": f"user.id={SENTINEL}"},
    )

    assert len(received) == 3
    for span in received:
        assert set(_attributes(span)) <= EXPORTABLE_SPAN_ATTRIBUTES
        assert span.events == ()
        assert span.status.description is None
        assert all(not link.attributes for link in span.links)
    unfiltered_server = next(
        span for span in telemetry.unfiltered.get_finished_spans() if span.kind is SpanKind.SERVER
    )
    assert SENTINEL in str(dict(unfiltered_server.attributes or {}))
    assert SENTINEL not in "".join(span.to_json() for span in received)


def test_generic_backend_output_stays_vendor_neutral(settings: Settings) -> None:
    telemetry = Telemetry(GENERIC)

    _interpret(settings, ScriptedModelProvider([interpreted_output()]), telemetry)

    assert len(telemetry.spans) == 3
    for span in telemetry.spans:
        assert not any(key.startswith("langfuse.") for key in _attributes(span))


def test_langfuse_backend_adds_no_export_thread_or_global_provider(settings: Settings) -> None:
    def started_threads(environ: Mapping[str, str]) -> int:
        telemetry = Telemetry(environ)
        before = threading.active_count()
        telemetry.runtime.start()
        started = threading.active_count() - before
        telemetry.runtime.shutdown()
        return started

    assert started_threads(LANGFUSE) == started_threads(GENERIC) == 1
    assert not isinstance(trace.get_tracer_provider(), TracerProvider)


def _assert_mapped_from_unfiltered_spans(telemetry: Telemetry) -> None:
    unfiltered = {span.context.span_id: span for span in telemetry.unfiltered.get_finished_spans()}
    for span in telemetry.spans:
        original = unfiltered[span.context.span_id]
        expected = {
            key: value
            for key, value in _attributes(original).items()
            if key in EXPORTABLE_SPAN_ATTRIBUTES
        }
        assert {
            key: value for key, value in _attributes(span).items() if key not in _destination(span)
        } == expected
        assert span.context.trace_id == original.context.trace_id
        assert span.parent == original.parent
        assert (span.name, span.kind, span.start_time, span.end_time) == (
            original.name,
            original.kind,
            original.start_time,
            original.end_time,
        )
        assert span.status.status_code is original.status.status_code
        assert span.instrumentation_scope == original.instrumentation_scope


def _assert_destination_safe(telemetry: Telemetry) -> None:
    serialized = telemetry.serialized()
    assert SENTINEL.encode() not in serialized
    assert REQUEST_ID not in str([_destination(span) for span in telemetry.spans])
    for span in telemetry.spans:
        assert set(_attributes(span)) <= ALLOWED_KEYS
        assert span.events == ()
        assert span.status.description is None
        assert all(not link.attributes for link in span.links)
        assert dict(span.resource.attributes) == {
            "service.name": "blendify-ai",
            "deployment.environment.name": "development",
        }
        assert not any(
            key in _attributes(span) for key in ("user.id", "session.id", "langfuse.user.id")
        )
