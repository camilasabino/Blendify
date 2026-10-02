import sys
import time
from collections.abc import Callable

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http import Compression
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.metrics import NoOpMeterProvider
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import SpanLimits, SpanProcessor, TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter, SpanExporter
from opentelemetry.sdk.trace.sampling import ParentBasedTraceIdRatio
from opentelemetry.semconv._incubating.attributes.deployment_attributes import (
    DEPLOYMENT_ENVIRONMENT_NAME,
)
from opentelemetry.semconv.attributes.service_attributes import SERVICE_NAME

from app.observability.langfuse_mapping import LangfuseSpanExporter
from app.observability.span_export_safety import (
    Clock,
    ShutdownWindowSpanExporter,
    redact_export_pipeline_logs,
)
from app.observability.span_privacy import PrivacySpanExporter
from app.observability.telemetry_config import MAX_OTLP_TIMEOUT_SECONDS, TelemetryConfig

BATCH_MAX_QUEUE_SIZE = 1024
BATCH_MAX_EXPORT_SIZE = 256
BATCH_SCHEDULE_DELAY_MILLIS = 5000
SHUTDOWN_EXPORT_WINDOW_SECONDS = 1.0
MAX_SPAN_ATTRIBUTES = 64
MAX_SPAN_EVENTS = 16
MAX_SPAN_LINKS = 8
MAX_ATTRIBUTES_PER_EVENT_OR_LINK = 16
MAX_ATTRIBUTE_VALUE_LENGTH = 256

SpanExporterFactory = Callable[[], SpanExporter]

_NO_OP_TRACER_PROVIDER = trace.NoOpTracerProvider()
_NO_OP_METER_PROVIDER = NoOpMeterProvider()


class TelemetryRuntime:
    def __init__(
        self,
        sdk_provider: TracerProvider | None = None,
        span_exporter_factory: SpanExporterFactory | None = None,
        *,
        clock: Clock = time.monotonic,
    ) -> None:
        self._sdk_provider = sdk_provider
        self._span_exporter_factory = span_exporter_factory
        self._clock = clock
        self._export_guard: ShutdownWindowSpanExporter | None = None
        self._started = False
        self._stopped = False

    @property
    def is_enabled(self) -> bool:
        return self._sdk_provider is not None

    @property
    def tracer_provider(self) -> trace.TracerProvider:
        return self._sdk_provider or _NO_OP_TRACER_PROVIDER

    def start(self) -> None:
        if self._sdk_provider is None or self._started or self._stopped:
            return

        self._started = True
        if self._span_exporter_factory is not None:
            redact_export_pipeline_logs()
            self._export_guard = ShutdownWindowSpanExporter(
                PrivacySpanExporter(self._span_exporter_factory()), self._clock
            )
            self._sdk_provider.add_span_processor(_batch_processor(self._export_guard))

    def shutdown(self) -> None:
        if self._sdk_provider is None or self._stopped:
            return

        self._stopped = True
        if self._export_guard is not None:
            self._export_guard.close_window(SHUTDOWN_EXPORT_WINDOW_SECONDS)
        self._sdk_provider.shutdown()


def build_telemetry_runtime(
    config: TelemetryConfig,
    deployment_environment: str,
    *,
    span_exporter: SpanExporter | None = None,
    clock: Clock = time.monotonic,
) -> TelemetryRuntime:
    if not config.enabled:
        return TelemetryRuntime()

    sdk_provider = TracerProvider(
        sampler=ParentBasedTraceIdRatio(config.sampler_ratio),
        resource=_resource(config, deployment_environment),
        shutdown_on_exit=False,
        span_limits=_span_limits(),
        meter_provider=_NO_OP_METER_PROVIDER,
    )
    exporter_factory = (
        (lambda: span_exporter) if span_exporter else configured_exporter_factory(config)
    )
    if exporter_factory is not None and config.backend == "langfuse":
        exporter_factory = _with_langfuse_mapping(exporter_factory)
    return TelemetryRuntime(sdk_provider, exporter_factory, clock=clock)


def _with_langfuse_mapping(exporter_factory: SpanExporterFactory) -> SpanExporterFactory:
    return lambda: LangfuseSpanExporter(exporter_factory())


def configured_exporter_factory(config: TelemetryConfig) -> SpanExporterFactory | None:
    otlp = config.otlp
    if config.exporter == "console":
        return lambda: ConsoleSpanExporter(out=sys.stdout)
    if config.exporter == "otlp" and otlp is not None:
        return lambda: OTLPSpanExporter(
            endpoint=otlp.endpoint,
            headers=dict(otlp.headers),
            timeout=otlp.timeout_seconds,
            compression=Compression.NoCompression,
            meter_provider=_NO_OP_METER_PROVIDER,
        )
    return None


def _batch_processor(exporter: SpanExporter) -> SpanProcessor:
    return BatchSpanProcessor(
        exporter,
        max_queue_size=BATCH_MAX_QUEUE_SIZE,
        schedule_delay_millis=BATCH_SCHEDULE_DELAY_MILLIS,
        max_export_batch_size=BATCH_MAX_EXPORT_SIZE,
        # The SDK ignores this value; passing it keeps OTEL_BSP_EXPORT_TIMEOUT from being read.
        export_timeout_millis=MAX_OTLP_TIMEOUT_SECONDS * 1000,
        meter_provider=_NO_OP_METER_PROVIDER,
    )


def _resource(config: TelemetryConfig, deployment_environment: str) -> Resource:
    return Resource(
        {
            DEPLOYMENT_ENVIRONMENT_NAME: deployment_environment,
            **config.resource_attributes,
            SERVICE_NAME: config.service_name,
        }
    )


def _span_limits() -> SpanLimits:
    return SpanLimits(
        max_attributes=MAX_SPAN_ATTRIBUTES,
        max_events=MAX_SPAN_EVENTS,
        max_links=MAX_SPAN_LINKS,
        max_span_attributes=MAX_SPAN_ATTRIBUTES,
        max_event_attributes=MAX_ATTRIBUTES_PER_EVENT_OR_LINK,
        max_link_attributes=MAX_ATTRIBUTES_PER_EVENT_OR_LINK,
        max_attribute_length=MAX_ATTRIBUTE_VALUE_LENGTH,
        max_span_attribute_length=MAX_ATTRIBUTE_VALUE_LENGTH,
    )
