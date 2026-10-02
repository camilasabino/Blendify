import logging
import threading
from collections.abc import Callable, Iterator, Sequence
from contextlib import AbstractContextManager, contextmanager

import pytest
from fastapi.testclient import TestClient
from opentelemetry.sdk.trace import ReadableSpan
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult
from opentelemetry.trace import SpanKind

from app.config.settings import Settings
from app.main import create_app
from app.observability.span_export_safety import (
    REDACTED_EXPORT_LOG_MESSAGE,
    redact_export_pipeline_logs,
)
from app.observability.telemetry_config import load_telemetry_config
from app.observability.telemetry_runtime import (
    BATCH_MAX_EXPORT_SIZE,
    BATCH_MAX_QUEUE_SIZE,
    TelemetryRuntime,
    build_telemetry_runtime,
)
from app.providers.model_provider import ModelTimeoutError
from tests.conftest import AUTH_HEADERS
from tests.fakes import ScriptedModelProvider, ScriptedOutput, interpreted_output
from tests.telemetry_fakes import (
    ENABLED,
    closed_loopback_port,
    record_spans,
    unresponsive_otlp_destination,
)

INTERPRET_ROUTE = "/v1/intent/interpret"
SYNC_TIMEOUT_SECONDS = 10
OTLP_FAILURE_TIMEOUT = "0.3"
OTLP_RETRYING_TIMEOUT = "2"
EXPORT_ERROR_SENTINEL = "EXPORTER_ERROR_TELEMETRY_SENTINEL"
ENDPOINT_PATH_SENTINEL = "ENDPOINT_PATH_TELEMETRY_SENTINEL"
ENDPOINT_QUERY_SENTINEL = "ENDPOINT_QUERY_TELEMETRY_SENTINEL"
HEADER_SENTINEL = "OTLP_HEADER_TELEMETRY_SENTINEL"
LOG_SENTINELS = (
    EXPORT_ERROR_SENTINEL,
    ENDPOINT_PATH_SENTINEL,
    ENDPOINT_QUERY_SENTINEL,
    HEADER_SENTINEL,
    "127.0.0.1",
)
PORT_SENTINEL = 47831
OTLP_LOGGER = "opentelemetry.exporter.otlp.proto.http.trace_exporter"
BATCH_LOGGER = "opentelemetry.sdk._shared_internal"
TRANSPORT_LOGGER = "urllib3.connectionpool"
INTERPRET_OUTPUTS: list[ScriptedOutput] = [
    interpreted_output(),
    {"outcome": "invalid"},
    interpreted_output(),
    ModelTimeoutError("timed out"),
    RuntimeError("unexpected"),
]
INTERPRET_REQUESTS = 4

Outcome = tuple[int, object]
FailingTelemetry = Callable[[], AbstractContextManager[tuple[TelemetryRuntime, Callable[[], bool]]]]


class FailingExporter(SpanExporter):
    def __init__(self) -> None:
        self.calls = 0

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        self.calls += 1
        return SpanExportResult.FAILURE

    def shutdown(self) -> None:
        return


class RaisingExporter(FailingExporter):
    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        self.calls += 1
        raise RuntimeError(f"collector said {EXPORT_ERROR_SENTINEL}")


class StuckExporter(SpanExporter):
    def __init__(self) -> None:
        self.entered = threading.Event()
        self.release = threading.Event()
        self.exported: list[ReadableSpan] = []

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        if not self.entered.is_set():
            self.entered.set()
            self.release.wait(SYNC_TIMEOUT_SECONDS)
        self.exported.extend(spans)
        return SpanExportResult.SUCCESS

    def shutdown(self) -> None:
        return


def _exercise(client: TestClient) -> list[Outcome]:
    outcomes: list[Outcome] = []
    for _ in range(INTERPRET_REQUESTS):
        response = client.post(INTERPRET_ROUTE, json={"prompt": "Radiohead"}, headers=AUTH_HEADERS)
        outcomes.append((response.status_code, response.json()))
    unauthenticated = client.post(INTERPRET_ROUTE, json={"prompt": "Radiohead"})
    health = client.get("/health")
    return [
        *outcomes,
        (unauthenticated.status_code, unauthenticated.json()),
        (health.status_code, health.json()),
    ]


def _run(settings: Settings, runtime: TelemetryRuntime | None) -> tuple[list[Outcome], int]:
    provider = ScriptedModelProvider(list(INTERPRET_OUTPUTS))
    app = create_app(settings, provider, telemetry=runtime)
    with TestClient(app, raise_server_exceptions=False) as client:
        outcomes = _exercise(client)
    return outcomes, len(provider.requests)


def _baseline(settings: Settings) -> tuple[list[Outcome], int]:
    disabled = build_telemetry_runtime(load_telemetry_config({}), "development")
    return _run(settings, disabled)


def _otlp_runtime(endpoint: str, timeout: str = OTLP_FAILURE_TIMEOUT) -> TelemetryRuntime:
    config = load_telemetry_config(
        {
            **ENABLED,
            "OTEL_TRACES_EXPORTER": "otlp",
            "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": endpoint,
            "OTEL_EXPORTER_OTLP_TRACES_HEADERS": f"authorization=Bearer%20{HEADER_SENTINEL}",
            "OTEL_EXPORTER_OTLP_TRACES_TIMEOUT": timeout,
        }
    )
    return build_telemetry_runtime(config, "development")


def _sentinel_endpoint(port: int) -> str:
    return f"http://127.0.0.1:{port}/v1/traces/{ENDPOINT_PATH_SENTINEL}?k={ENDPOINT_QUERY_SENTINEL}"


def _in_memory_runtime(exporter: SpanExporter) -> TelemetryRuntime:
    return build_telemetry_runtime(
        load_telemetry_config(ENABLED), "development", span_exporter=exporter
    )


@contextmanager
def _failing_result() -> Iterator[tuple[TelemetryRuntime, Callable[[], bool]]]:
    exporter = FailingExporter()
    yield _in_memory_runtime(exporter), lambda: exporter.calls > 0


@contextmanager
def _raising_exporter() -> Iterator[tuple[TelemetryRuntime, Callable[[], bool]]]:
    exporter = RaisingExporter()
    yield _in_memory_runtime(exporter), lambda: exporter.calls > 0


@contextmanager
def _refused_otlp() -> Iterator[tuple[TelemetryRuntime, Callable[[], bool]]]:
    yield _otlp_runtime(_sentinel_endpoint(closed_loopback_port())), lambda: True


@contextmanager
def _unresponsive_otlp() -> Iterator[tuple[TelemetryRuntime, Callable[[], bool]]]:
    with unresponsive_otlp_destination() as (port, accepted):
        yield _otlp_runtime(_sentinel_endpoint(port)), lambda: bool(accepted)


def _logged_text(caplog: pytest.LogCaptureFixture) -> str:
    return caplog.text + "\n".join(record.getMessage() for record in caplog.records)


@pytest.mark.parametrize(
    ("failing_telemetry", "failure_logger"),
    [
        (_failing_result, None),
        (_raising_exporter, BATCH_LOGGER),
        (_refused_otlp, OTLP_LOGGER),
        (_unresponsive_otlp, OTLP_LOGGER),
    ],
    ids=["failure-result", "exporter-exception", "otlp-refused", "otlp-unresponsive"],
)
def test_export_failures_leave_responses_readiness_and_provider_calls_unchanged(
    settings: Settings,
    caplog: pytest.LogCaptureFixture,
    failing_telemetry: FailingTelemetry,
    failure_logger: str | None,
) -> None:
    baseline = _baseline(settings)
    caplog.set_level(logging.DEBUG)

    with failing_telemetry() as (runtime, export_was_attempted):
        traced = _run(settings, runtime)
        attempted = export_was_attempted()

    assert traced == baseline
    assert attempted
    if failure_logger is not None:
        assert any(record.name == failure_logger for record in caplog.records)
    logged = _logged_text(caplog)
    for sentinel in LOG_SENTINELS:
        assert sentinel not in logged


def test_exporter_logs_keep_safe_diagnostics_without_the_endpoint(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.WARNING, logger=OTLP_LOGGER)
    runtime = _otlp_runtime(
        _sentinel_endpoint(closed_loopback_port()), timeout=OTLP_RETRYING_TIMEOUT
    )

    runtime.start()
    record_spans(runtime, 1)
    runtime.shutdown()

    messages = [record.getMessage() for record in caplog.records if record.name == OTLP_LOGGER]
    assert messages[0].startswith(
        "Transient error MaxRetryError encountered while exporting spans batch, retrying in"
    )
    assert messages[-1].startswith("Failed to export spans batch")
    for sentinel in LOG_SENTINELS:
        assert sentinel not in caplog.text


def _log_preformatted_endpoint(logger: logging.Logger) -> None:
    logger.warning(f"Export to {_sentinel_endpoint(PORT_SENTINEL)} failed")


def _log_unverified_template(logger: logging.Logger) -> None:
    logger.debug("Starting new HTTP connection (%d): %s:%s", 1, "127.0.0.1", PORT_SENTINEL)


def _log_exception_as_message(logger: logging.Logger) -> None:
    try:
        raise RuntimeError(f"{EXPORT_ERROR_SENTINEL} at {_sentinel_endpoint(PORT_SENTINEL)}")
    except RuntimeError as error:
        logger.error(error, exc_info=True, stack_info=True)


@pytest.mark.parametrize(
    ("emit", "expected"),
    [
        (_log_preformatted_endpoint, REDACTED_EXPORT_LOG_MESSAGE),
        (_log_unverified_template, REDACTED_EXPORT_LOG_MESSAGE),
        (_log_exception_as_message, f"{REDACTED_EXPORT_LOG_MESSAGE} [RuntimeError]"),
    ],
    ids=["preformatted-without-args", "unverified-template", "exception-message-with-traceback"],
)
def test_export_logs_without_a_verified_static_template_use_a_fixed_message(
    caplog: pytest.LogCaptureFixture, emit: Callable[[logging.Logger], None], expected: str
) -> None:
    redact_export_pipeline_logs()
    caplog.set_level(logging.DEBUG, logger=TRANSPORT_LOGGER)

    emit(logging.getLogger(TRANSPORT_LOGGER))

    (record,) = [record for record in caplog.records if record.name == TRANSPORT_LOGGER]
    assert record.getMessage() == expected
    for sentinel in (*LOG_SENTINELS, str(PORT_SENTINEL), "Traceback", "Stack"):
        assert sentinel not in caplog.text


def test_a_saturated_queue_drops_the_oldest_spans_without_blocking_requests(
    settings: Settings, caplog: pytest.LogCaptureFixture
) -> None:
    baseline = _baseline(settings)
    exporter = StuckExporter()
    runtime = build_telemetry_runtime(
        load_telemetry_config(ENABLED),
        "development",
        span_exporter=exporter,
        clock=lambda: 0.0,
    )
    provider = ScriptedModelProvider(list(INTERPRET_OUTPUTS))
    app = create_app(settings, provider, telemetry=runtime)

    with (
        caplog.at_level(logging.WARNING, logger=BATCH_LOGGER),
        TestClient(app, raise_server_exceptions=False) as client,
    ):
        record_spans(runtime, BATCH_MAX_EXPORT_SIZE)
        assert exporter.entered.wait(SYNC_TIMEOUT_SECONDS)
        record_spans(runtime, BATCH_MAX_QUEUE_SIZE)
        outcomes = _exercise(client)
        exporter.release.set()

    server_spans = [span for span in exporter.exported if span.kind is SpanKind.SERVER]
    assert (outcomes, len(provider.requests)) == baseline
    assert len(exporter.exported) == BATCH_MAX_EXPORT_SIZE + BATCH_MAX_QUEUE_SIZE
    assert len(server_spans) == INTERPRET_REQUESTS + 1
    assert "Queue full, dropping Span." in caplog.text
