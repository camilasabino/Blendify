import asyncio
import json
import logging
from collections.abc import Mapping

import anyio
import httpx2
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from opentelemetry import trace
from opentelemetry.sdk.trace import ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import SpanKind, StatusCode, format_span_id, format_trace_id

from app.config.settings import Settings
from app.main import create_app
from app.observability.request_correlation import current_request_id
from app.observability.telemetry_config import load_telemetry_config
from app.observability.telemetry_runtime import TelemetryRuntime, build_telemetry_runtime
from app.providers.model_provider import (
    ModelIntentRequest,
    ModelIntentResult,
    ModelUnavailableError,
)
from tests.conftest import AUTH_HEADERS, SERVICE_TOKEN, ClientFactory
from tests.fakes import (
    ScriptedModelProvider,
    ScriptedOutput,
    current_intent,
    empty_preservation,
    interpreted_output,
    refinement_output,
)

ENABLED = {"OTEL_SDK_DISABLED": "false"}
INTERPRET_ROUTE = "/v1/intent/interpret"
REFINEMENT_ROUTE = "/v1/refinement/plan"
EVENT_LOGGER = "app.observability.model_call_log"
REQUEST_ID_ATTRIBUTE = "blendify.request_id"
REQUEST_ID = "3f1c2a9e-7b4d-4e8a-9c1f-2d6b5e8a7c30"
OTHER_REQUEST_ID = "9b2e4c6a-1d3f-4a5b-8c7d-0e1f2a3b4c5d"
TRACE_ID = "0af7651916cd43dd8448eb211c80319c"
OTHER_TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736"
PARENT_SPAN_ID = "b7ad6b7169203331"
SENTINEL = "TELEMETRY_PRIVACY_SENTINEL"


class BarrierModelProvider(ScriptedModelProvider):
    def __init__(self, parties: int) -> None:
        super().__init__([interpreted_output() for _ in range(parties)])
        self._barrier = asyncio.Barrier(parties)

    async def generate_intent(self, request: ModelIntentRequest) -> ModelIntentResult:
        await self._barrier.wait()
        return await super().generate_intent(request)


def _runtime(
    exporter: InMemorySpanExporter, environ: Mapping[str, str] = ENABLED
) -> TelemetryRuntime:
    return build_telemetry_runtime(
        load_telemetry_config(environ), "development", span_exporter=exporter
    )


def _traced_app(
    settings: Settings, provider: ScriptedModelProvider, exporter: InMemorySpanExporter
) -> FastAPI:
    return create_app(settings, provider, telemetry=_runtime(exporter))


def _interpret(client: TestClient, headers: Mapping[str, str] | None = None) -> int:
    response = client.post(
        INTERPRET_ROUTE,
        json={"prompt": f"{SENTINEL} with Radiohead"},
        headers={**AUTH_HEADERS, **(headers or {})},
    )
    return response.status_code


def _traceparent(trace_id: str = TRACE_ID, flags: str = "01") -> str:
    return f"00-{trace_id}-{PARENT_SPAN_ID}-{flags}"


def _model_events(caplog: pytest.LogCaptureFixture) -> list[dict[str, object]]:
    return [
        json.loads(record.getMessage()) for record in caplog.records if record.name == EVENT_LOGGER
    ]


def _only_span(exporter: InMemorySpanExporter) -> ReadableSpan:
    (span,) = exporter.get_finished_spans()
    return span


def _span_of_kind(exporter: InMemorySpanExporter, kind: SpanKind) -> ReadableSpan:
    (span,) = (span for span in exporter.get_finished_spans() if span.kind is kind)
    return span


def _server_span(exporter: InMemorySpanExporter) -> ReadableSpan:
    return _span_of_kind(exporter, SpanKind.SERVER)


def _exported_text(exporter: InMemorySpanExporter) -> str:
    return "\n".join(span.to_json() for span in exporter.get_finished_spans())


def test_business_request_yields_one_server_span_with_allowlisted_http_attributes(
    settings: Settings,
) -> None:
    exporter = InMemorySpanExporter()
    app = _traced_app(settings, ScriptedModelProvider([interpreted_output()]), exporter)

    with TestClient(app) as client:
        assert _interpret(client) == 200

    span = _server_span(exporter)
    assert span.name == f"POST {INTERPRET_ROUTE}"
    assert dict(span.attributes or {}) == {
        "http.method": "POST",
        "http.route": INTERPRET_ROUTE,
        "http.status_code": 200,
        "http.scheme": "http",
        "http.flavor": "1.1",
    }
    assert span.status.status_code is StatusCode.UNSET
    assert span.events == ()


def test_refinement_is_a_separate_server_span_named_by_its_route(settings: Settings) -> None:
    exporter = InMemorySpanExporter()
    app = _traced_app(settings, ScriptedModelProvider([refinement_output()]), exporter)

    with TestClient(app) as client:
        response = client.post(
            REFINEMENT_ROUTE,
            json={
                "intent": current_intent(),
                "preservation": empty_preservation(),
                "refinement": "more rarities",
            },
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 200
    assert _server_span(exporter).name == f"POST {REFINEMENT_ROUTE}"


@pytest.mark.parametrize("path", ["/health", "/docs", "/openapi.json"])
def test_health_and_documentation_routes_are_not_traced(settings: Settings, path: str) -> None:
    exporter = InMemorySpanExporter()
    app = _traced_app(settings, ScriptedModelProvider([]), exporter)

    with TestClient(app) as client:
        response = client.get(path, headers={"traceparent": _traceparent()})

    assert response.status_code == 200
    assert exporter.get_finished_spans() == ()


@pytest.mark.parametrize("path", ["/healthz", "/health/extra", "/v1/health", "/docsx"])
def test_exclusions_match_whole_paths_only(settings: Settings, path: str) -> None:
    exporter = InMemorySpanExporter()
    app = _traced_app(settings, ScriptedModelProvider([]), exporter)

    with TestClient(app) as client:
        assert client.get(path).status_code == 404

    span = _only_span(exporter)
    assert span.name == "GET"
    assert "http.route" not in (span.attributes or {})


def test_valid_parent_context_continues_the_upstream_trace(settings: Settings) -> None:
    exporter = InMemorySpanExporter()
    app = _traced_app(settings, ScriptedModelProvider([interpreted_output()]), exporter)

    with TestClient(app) as client:
        status = _interpret(
            client, {"traceparent": _traceparent(), "tracestate": "blendify=upstream"}
        )

    span = _server_span(exporter)
    assert status == 200
    assert format_trace_id(span.context.trace_id) == TRACE_ID
    assert span.parent is not None
    assert span.parent.is_remote
    assert format_span_id(span.parent.span_id) == PARENT_SPAN_ID
    assert span.context.trace_state.get("blendify") == "upstream"


@pytest.mark.parametrize(
    "traceparent",
    [
        None,
        "",
        SENTINEL,
        f"00-{'0' * 32}-{PARENT_SPAN_ID}-01",
        f"00-{TRACE_ID}-{'0' * 16}-01",
        f"ff-{TRACE_ID}-{PARENT_SPAN_ID}-01",
        f"00-{TRACE_ID.upper()}-{PARENT_SPAN_ID}-01",
    ],
)
def test_absent_or_malformed_parent_context_starts_a_new_trace(
    settings: Settings, traceparent: str | None
) -> None:
    exporter = InMemorySpanExporter()
    app = _traced_app(settings, ScriptedModelProvider([interpreted_output()]), exporter)
    headers = {} if traceparent is None else {"traceparent": traceparent}

    with TestClient(app) as client:
        status = _interpret(client, headers)

    span = _server_span(exporter)
    assert status == 200
    assert span.parent is None
    assert span.context.is_valid
    assert format_trace_id(span.context.trace_id) != TRACE_ID


def test_model_logs_carry_the_active_span_context_and_request_id(
    settings: Settings, caplog: pytest.LogCaptureFixture
) -> None:
    exporter = InMemorySpanExporter()
    app = _traced_app(settings, ScriptedModelProvider([interpreted_output()]), exporter)

    with caplog.at_level(logging.INFO), TestClient(app) as client:
        status = _interpret(client, {"X-Request-Id": REQUEST_ID, "traceparent": _traceparent()})

    server_span = _server_span(exporter)
    span_by_event = {
        "ai.model_request": _span_of_kind(exporter, SpanKind.CLIENT),
        "ai.model_call": _span_of_kind(exporter, SpanKind.INTERNAL),
    }
    events = _model_events(caplog)
    assert status == 200
    assert [event["event"] for event in events] == ["ai.model_request", "ai.model_call"]
    for event in events:
        span = span_by_event[str(event["event"])]
        assert event["requestId"] == REQUEST_ID
        assert event["traceId"] == TRACE_ID == format_trace_id(span.context.trace_id)
        assert event["spanId"] == format_span_id(span.context.span_id)
    assert (server_span.attributes or {})[REQUEST_ID_ATTRIBUTE] == REQUEST_ID
    assert not isinstance(trace.get_tracer_provider(), TracerProvider)


@pytest.mark.parametrize("request_id", [None, "", SENTINEL, REQUEST_ID.upper(), f"{REQUEST_ID}x"])
def test_missing_or_invalid_request_ids_keep_existing_behavior(
    settings: Settings, caplog: pytest.LogCaptureFixture, request_id: str | None
) -> None:
    exporter = InMemorySpanExporter()
    app = _traced_app(settings, ScriptedModelProvider([interpreted_output()]), exporter)
    headers = {} if request_id is None else {"X-Request-Id": request_id}

    with caplog.at_level(logging.INFO), TestClient(app) as client:
        assert _interpret(client, headers) == 200

    span = _server_span(exporter)
    for exported in exporter.get_finished_spans():
        assert REQUEST_ID_ATTRIBUTE not in (exported.attributes or {})
    assert {event["requestId"] for event in _model_events(caplog)} == {None}
    assert {event["traceId"] for event in _model_events(caplog)} == {
        format_trace_id(span.context.trace_id)
    }


def test_disabled_telemetry_adds_no_trace_fields_even_with_a_parent_context(
    make_client: ClientFactory, caplog: pytest.LogCaptureFixture
) -> None:
    client = make_client(ScriptedModelProvider([interpreted_output()]))

    with caplog.at_level(logging.INFO):
        assert _interpret(client, {"traceparent": _traceparent()}) == 200

    events = _model_events(caplog)
    assert events
    for event in events:
        assert "traceId" not in event
        assert "spanId" not in event


def test_enabled_tracing_without_an_exporter_still_correlates_logs(
    settings: Settings, caplog: pytest.LogCaptureFixture
) -> None:
    runtime = build_telemetry_runtime(load_telemetry_config(ENABLED), "development")
    app = create_app(settings, ScriptedModelProvider([interpreted_output()]), telemetry=runtime)

    with caplog.at_level(logging.INFO), TestClient(app) as client:
        assert _interpret(client, {"traceparent": _traceparent()}) == 200

    assert {event["traceId"] for event in _model_events(caplog)} == {TRACE_ID}


def test_requests_use_the_provider_activated_by_the_app_lifespan(settings: Settings) -> None:
    exporter = InMemorySpanExporter()
    app = _traced_app(
        settings, ScriptedModelProvider([interpreted_output(), interpreted_output()]), exporter
    )
    client = TestClient(app, raise_server_exceptions=False)

    assert _interpret(client) == 200
    assert exporter.get_finished_spans() == ()

    with client:
        assert _interpret(client) == 200

    spans = exporter.get_finished_spans()
    assert _server_span(exporter).name == f"POST {INTERPRET_ROUTE}"
    assert len({span.context.trace_id for span in spans}) == 1


def test_each_app_traces_with_its_own_runtime(settings: Settings) -> None:
    first_exporter, second_exporter = InMemorySpanExporter(), InMemorySpanExporter()
    first_app = _traced_app(settings, ScriptedModelProvider([interpreted_output()]), first_exporter)
    second_app = _traced_app(
        settings, ScriptedModelProvider([interpreted_output()]), second_exporter
    )

    with TestClient(second_app) as second_client, TestClient(first_app) as first_client:
        assert _interpret(second_client, {"traceparent": _traceparent(OTHER_TRACE_ID)}) == 200
        assert _interpret(first_client, {"traceparent": _traceparent()}) == 200

    for exporter, trace_id in ((first_exporter, TRACE_ID), (second_exporter, OTHER_TRACE_ID)):
        spans = exporter.get_finished_spans()
        assert len(spans) == 3
        assert {format_trace_id(span.context.trace_id) for span in spans} == {trace_id}


@pytest.mark.anyio
async def test_concurrent_requests_keep_request_ids_and_trace_context_isolated(
    settings: Settings, caplog: pytest.LogCaptureFixture
) -> None:
    exporter = InMemorySpanExporter()
    app = create_app(settings, BarrierModelProvider(parties=2), telemetry=_runtime(exporter))
    trace_ids_by_request_id = {REQUEST_ID: TRACE_ID, OTHER_REQUEST_ID: OTHER_TRACE_ID}
    transport = httpx2.ASGITransport(app=app)

    with caplog.at_level(logging.INFO):
        async with (
            app.router.lifespan_context(app),
            httpx2.AsyncClient(transport=transport, base_url="http://testserver") as client,
        ):
            with anyio.fail_after(5):
                responses = await asyncio.gather(
                    *(
                        client.post(
                            INTERPRET_ROUTE,
                            json={"prompt": "Radiohead"},
                            headers={
                                **AUTH_HEADERS,
                                "X-Request-Id": request_id,
                                "traceparent": _traceparent(trace_id),
                            },
                        )
                        for request_id, trace_id in trace_ids_by_request_id.items()
                    )
                )

    spans = exporter.get_finished_spans()
    kind_by_event = {"ai.model_request": SpanKind.CLIENT, "ai.model_call": SpanKind.INTERNAL}
    span_ids = {
        (format_trace_id(span.context.trace_id), span.kind): format_span_id(span.context.span_id)
        for span in spans
    }
    request_ids_by_span = {
        (format_trace_id(span.context.trace_id), span.kind): (span.attributes or {}).get(
            REQUEST_ID_ATTRIBUTE
        )
        for span in spans
    }
    assert [response.status_code for response in responses] == [200, 200]
    assert len(spans) == len(span_ids) == 6
    for request_id, trace_id in trace_ids_by_request_id.items():
        assert request_ids_by_span[(trace_id, SpanKind.SERVER)] == request_id
        assert request_ids_by_span[(trace_id, SpanKind.INTERNAL)] == request_id
    events = _model_events(caplog)
    assert len(events) == 4
    for event in events:
        trace_id = trace_ids_by_request_id[str(event["requestId"])]
        assert event["traceId"] == trace_id
        assert event["spanId"] == span_ids[(trace_id, kind_by_event[str(event["event"])])]
    assert current_request_id() is None
    assert trace.get_current_span() is trace.INVALID_SPAN


def test_sentinels_in_headers_query_path_and_body_are_never_exported(
    settings: Settings, caplog: pytest.LogCaptureFixture
) -> None:
    exporter = InMemorySpanExporter()
    app = _traced_app(settings, ScriptedModelProvider([interpreted_output()]), exporter)
    sentinel_headers = {
        "User-Agent": SENTINEL,
        "Cookie": f"session={SENTINEL}",
        "X-Custom": SENTINEL,
        "baggage": f"user={SENTINEL}",
        "X-Forwarded-For": SENTINEL,
    }

    with caplog.at_level(logging.DEBUG), TestClient(app) as client:
        client.post(
            f"{INTERPRET_ROUTE}?token={SENTINEL}",
            json={"prompt": SENTINEL},
            headers={**AUTH_HEADERS, **sentinel_headers},
        )
        client.get(f"/{SENTINEL}?q={SENTINEL}", headers=sentinel_headers)

    exported = _exported_text(exporter)
    assert len(exporter.get_finished_spans()) == 4
    assert SENTINEL not in exported
    assert SERVICE_TOKEN not in exported
    assert SENTINEL not in "\n".join(str(_model_events(caplog)))


def test_unhandled_failures_export_no_exception_details(settings: Settings) -> None:
    exporter = InMemorySpanExporter()
    provider = ScriptedModelProvider([RuntimeError(f"provider leaked {SENTINEL}")])
    app = _traced_app(settings, provider, exporter)

    with TestClient(app, raise_server_exceptions=False) as client:
        status = _interpret(client)

    assert status == 500
    assert len(exporter.get_finished_spans()) == 3
    for span in exporter.get_finished_spans():
        assert span.status.status_code is StatusCode.ERROR
        assert span.status.description is None
        assert span.events == ()
    assert SENTINEL not in _exported_text(exporter)


@pytest.mark.parametrize(
    ("provider_output", "headers", "expected_status", "expected_span_status"),
    [
        (interpreted_output(), {}, 401, StatusCode.UNSET),
        (ModelUnavailableError(SENTINEL), AUTH_HEADERS, 503, StatusCode.ERROR),
    ],
)
def test_server_span_status_follows_the_http_response(
    settings: Settings,
    provider_output: ScriptedOutput,
    headers: Mapping[str, str],
    expected_status: int,
    expected_span_status: StatusCode,
) -> None:
    exporter = InMemorySpanExporter()
    app = _traced_app(settings, ScriptedModelProvider([provider_output]), exporter)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(INTERPRET_ROUTE, json={"prompt": "Radiohead"}, headers=headers)

    span = _server_span(exporter)
    assert response.status_code == expected_status
    assert (span.attributes or {})["http.status_code"] == expected_status
    assert span.status.status_code is expected_span_status
    assert span.status.description is None
    assert SENTINEL not in _exported_text(exporter)


def test_tracing_adds_no_response_headers(settings: Settings, make_client: ClientFactory) -> None:
    traced = TestClient(
        _traced_app(settings, ScriptedModelProvider([interpreted_output()]), InMemorySpanExporter())
    )
    untraced = make_client(ScriptedModelProvider([interpreted_output()]))
    headers = {**AUTH_HEADERS, "traceparent": _traceparent()}

    with traced:
        traced_response = traced.post(INTERPRET_ROUTE, json={"prompt": "x"}, headers=headers)
    untraced_response = untraced.post(INTERPRET_ROUTE, json={"prompt": "x"}, headers=headers)

    assert traced_response.json() == untraced_response.json()
    assert set(traced_response.headers) == set(untraced_response.headers)
