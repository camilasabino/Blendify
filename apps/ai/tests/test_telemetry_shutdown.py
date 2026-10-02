import logging
import threading
import time
from collections.abc import Callable, Sequence

import pytest
from opentelemetry.sdk.trace import ReadableSpan
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult

from app.observability.telemetry_config import MAX_OTLP_TIMEOUT_SECONDS, load_telemetry_config
from app.observability.telemetry_runtime import (
    BATCH_MAX_EXPORT_SIZE,
    BATCH_MAX_QUEUE_SIZE,
    SHUTDOWN_EXPORT_WINDOW_SECONDS,
    build_telemetry_runtime,
)
from tests.telemetry_fakes import ENABLED, record_spans, unresponsive_otlp_destination

SYNC_TIMEOUT_SECONDS = 10
UNRESPONSIVE_EXPORT_TIMEOUT = "0.5"
SAFETY_LOGGER = "app.observability.span_export_safety"


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0
        self.on_next_read: Callable[[], None] | None = None

    def __call__(self) -> float:
        value = self.now
        hook, self.on_next_read = self.on_next_read, None
        if hook is not None:
            hook()
        return value


class HungBackendExporter(SpanExporter):
    def __init__(self, clock: FakeClock, seconds_per_export: float) -> None:
        self._clock = clock
        self._seconds_per_export = seconds_per_export
        self.entered = threading.Event()
        self.release = threading.Event()
        self.batch_sizes: list[int] = []
        self.shutdown_calls = 0

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        self.batch_sizes.append(len(spans))
        if len(self.batch_sizes) == 1:
            self.entered.set()
            self.release.wait(SYNC_TIMEOUT_SECONDS)
        self._clock.now += self._seconds_per_export
        return SpanExportResult.FAILURE

    def shutdown(self) -> None:
        self.shutdown_calls += 1


def test_shutdown_stops_starting_exports_once_the_window_closes(
    caplog: pytest.LogCaptureFixture,
) -> None:
    clock = FakeClock()
    backend = HungBackendExporter(clock, seconds_per_export=MAX_OTLP_TIMEOUT_SECONDS)
    runtime = build_telemetry_runtime(
        load_telemetry_config(ENABLED), "development", span_exporter=backend, clock=clock
    )
    runtime.start()
    record_spans(runtime, BATCH_MAX_EXPORT_SIZE)
    assert backend.entered.wait(SYNC_TIMEOUT_SECONDS)
    record_spans(runtime, BATCH_MAX_QUEUE_SIZE)
    clock.on_next_read = backend.release.set

    shutdown = threading.Thread(target=runtime.shutdown)
    with caplog.at_level(logging.WARNING, logger=SAFETY_LOGGER):
        shutdown.start()
        shutdown.join(SYNC_TIMEOUT_SECONDS)

    assert not shutdown.is_alive()
    assert backend.batch_sizes == [BATCH_MAX_EXPORT_SIZE]
    assert backend.shutdown_calls == 1
    assert f"Dropped {BATCH_MAX_QUEUE_SIZE} spans" in caplog.text


def test_shutdown_with_an_unresponsive_otlp_backend_is_bounded_by_the_export_timeout() -> None:
    with unresponsive_otlp_destination() as (port, accepted):
        config = load_telemetry_config(
            {
                **ENABLED,
                "OTEL_TRACES_EXPORTER": "otlp",
                "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": f"http://127.0.0.1:{port}/v1/traces",
                "OTEL_EXPORTER_OTLP_TRACES_TIMEOUT": UNRESPONSIVE_EXPORT_TIMEOUT,
            }
        )
        runtime = build_telemetry_runtime(config, "development")
        runtime.start()
        record_spans(runtime, BATCH_MAX_EXPORT_SIZE - 1)

        started_at = time.monotonic()
        runtime.shutdown()
        elapsed = time.monotonic() - started_at

        assert accepted
    assert elapsed < SHUTDOWN_EXPORT_WINDOW_SECONDS + MAX_OTLP_TIMEOUT_SECONDS
