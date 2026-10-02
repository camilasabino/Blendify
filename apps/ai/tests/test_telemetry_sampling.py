import json
import logging

import pytest
from fastapi.testclient import TestClient
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import SpanKind, format_span_id, format_trace_id

from app.config.settings import Settings
from app.main import create_app
from app.observability.telemetry_config import load_telemetry_config
from app.observability.telemetry_runtime import TelemetryRuntime, build_telemetry_runtime
from tests.conftest import AUTH_HEADERS
from tests.fakes import ScriptedModelProvider, ScriptedOutput, interpreted_output
from tests.telemetry_fakes import ENABLED

INTERPRET_ROUTE = "/v1/intent/interpret"
EVENT_LOGGER = "app.observability.model_call_log"
PARENT_TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736"
PARENT_SPAN_ID = "00f067aa0ba902b7"
SAMPLED_PARENT = f"00-{PARENT_TRACE_ID}-{PARENT_SPAN_ID}-01"
UNSAMPLED_PARENT = f"00-{PARENT_TRACE_ID}-{PARENT_SPAN_ID}-00"
RETRYING_OUTPUTS: list[ScriptedOutput] = [{"outcome": "invalid"}, interpreted_output()]
EXPORTED_KINDS = sorted(
    kind.name for kind in (SpanKind.SERVER, SpanKind.INTERNAL, SpanKind.CLIENT, SpanKind.CLIENT)
)


def _interpret(
    settings: Settings, runtime: TelemetryRuntime, headers: dict[str, str]
) -> tuple[int, object, int]:
    provider = ScriptedModelProvider(list(RETRYING_OUTPUTS))
    app = create_app(settings, provider, telemetry=runtime)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            INTERPRET_ROUTE, json={"prompt": "Radiohead"}, headers={**AUTH_HEADERS, **headers}
        )
    return response.status_code, response.json(), len(provider.requests)


@pytest.mark.parametrize(
    ("ratio", "traceparent", "exported"),
    [
        ("1", None, True),
        ("0", None, False),
        ("0", SAMPLED_PARENT, True),
        ("1", UNSAMPLED_PARENT, False),
    ],
    ids=["ratio-1", "ratio-0", "ratio-0-sampled-parent", "ratio-1-unsampled-parent"],
)
def test_parent_based_ratio_sampling(
    settings: Settings,
    caplog: pytest.LogCaptureFixture,
    ratio: str,
    traceparent: str | None,
    exported: bool,
) -> None:
    exporter = InMemorySpanExporter()
    runtime = build_telemetry_runtime(
        load_telemetry_config({**ENABLED, "OTEL_TRACES_SAMPLER_ARG": ratio}),
        "development",
        span_exporter=exporter,
    )
    disabled = build_telemetry_runtime(load_telemetry_config({}), "development")
    headers = {"traceparent": traceparent} if traceparent else {}

    baseline = _interpret(settings, disabled, headers)
    with caplog.at_level(logging.INFO, logger=EVENT_LOGGER):
        caplog.clear()
        traced = _interpret(settings, runtime, headers)

    spans = exporter.get_finished_spans()
    events = [json.loads(record.getMessage()) for record in caplog.records]
    assert traced == baseline
    assert traced[2] == len(RETRYING_OUTPUTS)
    assert sorted(span.kind.name for span in spans) == (EXPORTED_KINDS if exported else [])
    assert len(events) == len(RETRYING_OUTPUTS) + 1
    assert all(event.get("traceId") and event.get("spanId") for event in events)
    if traceparent:
        assert {event["traceId"] for event in events} == {PARENT_TRACE_ID}
    if traceparent and exported:
        server = next(span for span in spans if span.kind is SpanKind.SERVER)
        assert format_trace_id(server.context.trace_id) == PARENT_TRACE_ID
        assert server.parent is not None
        assert format_span_id(server.parent.span_id) == PARENT_SPAN_ID
