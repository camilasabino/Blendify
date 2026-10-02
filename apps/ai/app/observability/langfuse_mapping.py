import re
from collections.abc import Mapping, Sequence
from types import MappingProxyType

from opentelemetry.sdk.trace import ReadableSpan
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult
from opentelemetry.semconv.attributes.error_attributes import ERROR_TYPE
from opentelemetry.trace import SpanKind
from opentelemetry.util.types import AttributeValue

from app.observability.span_privacy import (
    AI_ATTEMPT_ATTRIBUTE,
    AI_ERROR_CODE_ATTRIBUTE,
    AI_OPERATION_ATTRIBUTE,
    AI_OUTCOME_ATTRIBUTE,
    AI_PROMPT_VERSION_ATTRIBUTE,
    AI_RESULT_ATTRIBUTE,
    GEN_AI_OPERATION_NAME,
    GEN_AI_PROVIDER_NAME,
    GEN_AI_REQUEST_MODEL,
    GEN_AI_RESPONSE_MODEL,
    exportable_copy,
)

LANGFUSE_OBSERVATION_TYPE = "langfuse.observation.type"
LANGFUSE_OBSERVATION_MODEL = "langfuse.observation.model.name"
SPAN_OBSERVATION = "span"
GENERATION_OBSERVATION = "generation"
METADATA_VALUE_PATTERN = re.compile(r"^[A-Za-z0-9_.:-]{1,64}$")

OBSERVATION_METADATA_SOURCES: Mapping[str, str] = MappingProxyType(
    {
        "langfuse.observation.metadata.operation": AI_OPERATION_ATTRIBUTE,
        "langfuse.observation.metadata.prompt_version": AI_PROMPT_VERSION_ATTRIBUTE,
        "langfuse.observation.metadata.provider": GEN_AI_PROVIDER_NAME,
        "langfuse.observation.metadata.attempt": AI_ATTEMPT_ATTRIBUTE,
        "langfuse.observation.metadata.result": AI_RESULT_ATTRIBUTE,
        "langfuse.observation.metadata.outcome": AI_OUTCOME_ATTRIBUTE,
        "langfuse.observation.metadata.error_code": AI_ERROR_CODE_ATTRIBUTE,
        "langfuse.observation.metadata.error_type": ERROR_TYPE,
    }
)
LANGFUSE_DESTINATION_ATTRIBUTES = frozenset(
    {LANGFUSE_OBSERVATION_TYPE, LANGFUSE_OBSERVATION_MODEL, *OBSERVATION_METADATA_SOURCES}
)


class LangfuseSpanExporter(SpanExporter):
    def __init__(self, exporter: SpanExporter) -> None:
        self._exporter = exporter

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        return self._exporter.export([langfuse_observation(span) for span in spans])

    def shutdown(self) -> None:
        self._exporter.shutdown()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return self._exporter.force_flush(timeout_millis)


def langfuse_observation(span: ReadableSpan) -> ReadableSpan:
    attributes = span.attributes or {}
    destination: dict[str, AttributeValue] = {
        LANGFUSE_OBSERVATION_TYPE: _observation_type(span.kind, attributes)
    }

    if destination[LANGFUSE_OBSERVATION_TYPE] == GENERATION_OBSERVATION:
        model = _text(attributes.get(GEN_AI_RESPONSE_MODEL)) or _text(
            attributes.get(GEN_AI_REQUEST_MODEL)
        )
        if model is not None:
            destination[LANGFUSE_OBSERVATION_MODEL] = model

    for key, source in OBSERVATION_METADATA_SOURCES.items():
        value = _metadata_value(attributes.get(source))
        if value is not None:
            destination[key] = value

    return exportable_copy(span, destination)


def _observation_type(kind: SpanKind, attributes: Mapping[str, object]) -> str:
    if kind is SpanKind.CLIENT and GEN_AI_OPERATION_NAME in attributes:
        return GENERATION_OBSERVATION
    return SPAN_OBSERVATION


def _text(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def _metadata_value(value: object) -> str | None:
    if isinstance(value, bool) or not isinstance(value, str | int):
        return None

    text = str(value)
    return text if METADATA_VALUE_PATTERN.fullmatch(text) else None
