from collections.abc import Sequence

from opentelemetry.sdk.trace import ReadableSpan
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult
from opentelemetry.semconv._incubating.attributes.http_attributes import (
    HTTP_FLAVOR,
    HTTP_METHOD,
    HTTP_SCHEME,
    HTTP_STATUS_CODE,
)
from opentelemetry.semconv.attributes.error_attributes import ERROR_TYPE
from opentelemetry.semconv.attributes.http_attributes import HTTP_ROUTE
from opentelemetry.trace import Link, Status

REQUEST_ID_ATTRIBUTE = "blendify.request_id"

AI_OPERATION_ATTRIBUTE = "blendify.ai.operation"
AI_PROMPT_VERSION_ATTRIBUTE = "blendify.ai.prompt.version"
AI_ATTEMPT_ATTRIBUTE = "blendify.ai.attempt"
AI_RESULT_ATTRIBUTE = "blendify.ai.result"
AI_OUTCOME_ATTRIBUTE = "blendify.ai.outcome"
AI_ERROR_CODE_ATTRIBUTE = "blendify.ai.error_code"
AI_VALIDATION_ERROR_COUNT_ATTRIBUTE = "blendify.ai.validation_error_count"

GEN_AI_PROVIDER_NAME = "gen_ai.provider.name"
GEN_AI_OPERATION_NAME = "gen_ai.operation.name"
GEN_AI_REQUEST_MODEL = "gen_ai.request.model"
GEN_AI_RESPONSE_MODEL = "gen_ai.response.model"
GEN_AI_USAGE_INPUT_TOKENS = "gen_ai.usage.input_tokens"
GEN_AI_USAGE_OUTPUT_TOKENS = "gen_ai.usage.output_tokens"

EXPORTABLE_SPAN_ATTRIBUTES = frozenset(
    {
        HTTP_METHOD,
        HTTP_ROUTE,
        HTTP_STATUS_CODE,
        HTTP_SCHEME,
        HTTP_FLAVOR,
        REQUEST_ID_ATTRIBUTE,
        AI_OPERATION_ATTRIBUTE,
        AI_PROMPT_VERSION_ATTRIBUTE,
        AI_ATTEMPT_ATTRIBUTE,
        AI_RESULT_ATTRIBUTE,
        AI_OUTCOME_ATTRIBUTE,
        AI_ERROR_CODE_ATTRIBUTE,
        AI_VALIDATION_ERROR_COUNT_ATTRIBUTE,
        GEN_AI_PROVIDER_NAME,
        GEN_AI_OPERATION_NAME,
        GEN_AI_REQUEST_MODEL,
        GEN_AI_RESPONSE_MODEL,
        GEN_AI_USAGE_INPUT_TOKENS,
        GEN_AI_USAGE_OUTPUT_TOKENS,
        ERROR_TYPE,
    }
)


class PrivacySpanExporter(SpanExporter):
    def __init__(self, exporter: SpanExporter) -> None:
        self._exporter = exporter

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        return self._exporter.export([_exportable(span) for span in spans])

    def shutdown(self) -> None:
        self._exporter.shutdown()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return self._exporter.force_flush(timeout_millis)


def _exportable(span: ReadableSpan) -> ReadableSpan:
    return ReadableSpan(
        name=span.name,
        context=span.context,
        parent=span.parent,
        resource=span.resource,
        attributes={
            key: value
            for key, value in (span.attributes or {}).items()
            if key in EXPORTABLE_SPAN_ATTRIBUTES
        },
        events=(),
        links=tuple(Link(link.context) for link in span.links),
        kind=span.kind,
        status=Status(span.status.status_code),
        start_time=span.start_time,
        end_time=span.end_time,
        instrumentation_scope=span.instrumentation_scope,
    )
