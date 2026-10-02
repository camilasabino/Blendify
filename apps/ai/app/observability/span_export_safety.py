import logging
import threading
import time
from collections.abc import Callable, Mapping, Sequence

from opentelemetry.sdk.trace import ReadableSpan
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult

EXPORT_PIPELINE_LOGGERS = (
    "opentelemetry.exporter.otlp.proto.http.trace_exporter",
    "opentelemetry.exporter.otlp.proto.http._common",
    "opentelemetry.exporter.otlp.common.http",
    "opentelemetry.sdk._shared_internal",
    "opentelemetry.sdk.trace.export",
    "urllib3.connection",
    "urllib3.connectionpool",
    "urllib3.poolmanager",
    "urllib3.response",
    "urllib3.util.retry",
)
STATIC_EXPORT_LOG_TEMPLATES = frozenset(
    {
        "Exception while exporting %s.",
        "Exporter already shutdown, ignoring batch",
        "Exporter already shutdown, ignoring call",
        "Failed to encode span batch: %s",
        "Failed to export %s batch code: %s, reason: %s",
        "Failed to export %s batch due to timeout, max retries or shutdown.",
        "OTLP client already shutdown, ignoring call",
        "Queue full, dropping %s.",
        "Shutdown called, ignoring %s.",
        "Shutdown in progress, aborting retry.",
        "Transient error %s encountered while exporting %s batch, retrying in %.2fs.",
    }
)
SAFE_LOG_WORDS = frozenset({"Span", "spans"})
REDACTED = "[redacted]"
REDACTED_EXPORT_LOG_MESSAGE = "Span export pipeline log redacted"

Clock = Callable[[], float]

_logger = logging.getLogger(__name__)


class ShutdownWindowSpanExporter(SpanExporter):
    def __init__(self, exporter: SpanExporter, clock: Clock = time.monotonic) -> None:
        self._exporter = exporter
        self._clock = clock
        self._lock = threading.Lock()
        self._deadline: float | None = None
        self._window_seconds = 0.0
        self._dropped_spans = 0

    def close_window(self, seconds: float) -> None:
        with self._lock:
            self._window_seconds = seconds
            self._deadline = self._clock() + seconds

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        with self._lock:
            if self._deadline is not None and self._clock() >= self._deadline:
                self._dropped_spans += len(spans)
                return SpanExportResult.FAILURE

        return self._exporter.export(spans)

    def shutdown(self) -> None:
        if self._dropped_spans:
            _logger.warning(
                "Dropped %d spans that could not start exporting within %g s of shutdown",
                self._dropped_spans,
                self._window_seconds,
            )
        self._exporter.shutdown()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return self._exporter.force_flush(timeout_millis)


class _ExportLogRedactionFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        arguments = _log_arguments(record)
        traceback_type = record.exc_info[0] if record.exc_info else None
        if isinstance(record.msg, str) and record.msg in STATIC_EXPORT_LOG_TEMPLATES:
            record.args = tuple(_safe_log_argument(value) for value in arguments)
            exception_names = []
        else:
            record.msg = REDACTED_EXPORT_LOG_MESSAGE
            record.args = ()
            exception_names = [
                type(value).__name__ for value in arguments if isinstance(value, BaseException)
            ]
        if traceback_type is not None:
            exception_names.append(traceback_type.__name__)
        if exception_names:
            record.msg = f"{record.msg} [{', '.join(exception_names)}]"

        record.exc_info = None
        record.exc_text = None
        record.stack_info = None
        return True


_EXPORT_LOG_REDACTION = _ExportLogRedactionFilter()


def redact_export_pipeline_logs() -> None:
    for name in EXPORT_PIPELINE_LOGGERS:
        logging.getLogger(name).addFilter(_EXPORT_LOG_REDACTION)


def _log_arguments(record: logging.LogRecord) -> tuple[object, ...]:
    if isinstance(record.args, Mapping):
        return tuple(record.args.values())
    return tuple(record.args or ())


def _safe_log_argument(value: object) -> object:
    if value is None or isinstance(value, bool | int | float):
        return value
    if isinstance(value, BaseException):
        return type(value).__name__
    if isinstance(value, str) and value in SAFE_LOG_WORDS:
        return value
    return REDACTED
