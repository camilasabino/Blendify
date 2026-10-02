from collections.abc import Iterator, Mapping
from contextlib import AbstractContextManager, contextmanager, nullcontext

from opentelemetry import trace
from opentelemetry.semconv.attributes.error_attributes import ERROR_TYPE, ErrorTypeValues
from opentelemetry.trace import Span, SpanKind, StatusCode, Tracer, TracerProvider
from opentelemetry.util.types import AttributeValue

from app.observability.model_call_log import ModelCallRecord, ModelOperation, ModelRequestRecord
from app.observability.request_correlation import current_request_id
from app.observability.span_privacy import (
    AI_ATTEMPT_ATTRIBUTE,
    AI_ERROR_CODE_ATTRIBUTE,
    AI_OPERATION_ATTRIBUTE,
    AI_OUTCOME_ATTRIBUTE,
    AI_PROMPT_VERSION_ATTRIBUTE,
    AI_RESULT_ATTRIBUTE,
    AI_VALIDATION_ERROR_COUNT_ATTRIBUTE,
    GEN_AI_OPERATION_NAME,
    GEN_AI_PROVIDER_NAME,
    GEN_AI_REQUEST_MODEL,
    GEN_AI_RESPONSE_MODEL,
    GEN_AI_USAGE_INPUT_TOKENS,
    GEN_AI_USAGE_OUTPUT_TOKENS,
    REQUEST_ID_ATTRIBUTE,
)
from app.providers.model_provider import ModelInvocationMetadata

MODEL_CALL_TRACER_NAME = "blendify.ai"

USE_CASE_SPAN_NAMES: Mapping[ModelOperation, str] = {
    "intent_interpretation": "blendify.ai.interpret",
    "refinement_interpretation": "blendify.ai.refine",
}

_NO_OP_TRACER = trace.NoOpTracer()

Attributes = dict[str, AttributeValue]


class ModelCallSpan:
    def __init__(self, span: Span) -> None:
        self._span = span
        self._recorded = False

    def record_request(self, record: ModelRequestRecord, response_model: str | None) -> None:
        attributes: Attributes = {AI_RESULT_ATTRIBUTE: record.result}
        if response_model is not None:
            attributes[GEN_AI_RESPONSE_MODEL] = response_model
        if record.usage is not None:
            attributes[GEN_AI_USAGE_INPUT_TOKENS] = record.usage.input_tokens
            attributes[GEN_AI_USAGE_OUTPUT_TOKENS] = record.usage.output_tokens
        if record.validation_error_count is not None:
            attributes[AI_VALIDATION_ERROR_COUNT_ATTRIBUTE] = record.validation_error_count

        self._record(attributes, None if record.result == "ok" else record.result)

    def record_call(self, record: ModelCallRecord) -> None:
        attributes: Attributes = {AI_RESULT_ATTRIBUTE: record.result}
        if record.outcome is not None:
            attributes[AI_OUTCOME_ATTRIBUTE] = record.outcome
        if record.error_code is not None:
            attributes[AI_ERROR_CODE_ATTRIBUTE] = record.error_code

        self._record(attributes, record.error_code)

    def record_unclassified_failure(self) -> None:
        if not self._recorded:
            self._record({}, ErrorTypeValues.OTHER.value)

    def _record(self, attributes: Attributes, error_type: str | None) -> None:
        self._recorded = True
        self._span.set_attributes(attributes)
        if error_type is not None:
            self._span.set_attribute(ERROR_TYPE, error_type)
            self._span.set_status(StatusCode.ERROR)


_UNTRACED = ModelCallSpan(trace.INVALID_SPAN)


def model_call_tracer(tracer_provider: TracerProvider | None) -> Tracer:
    if tracer_provider is None:
        return _NO_OP_TRACER
    return tracer_provider.get_tracer(MODEL_CALL_TRACER_NAME)


def use_case_span(
    tracer: Tracer, operation: ModelOperation, prompt_version: str
) -> AbstractContextManager[ModelCallSpan]:
    attributes: Attributes = {
        AI_OPERATION_ATTRIBUTE: operation,
        AI_PROMPT_VERSION_ATTRIBUTE: prompt_version,
    }
    request_id = current_request_id()
    if request_id is not None:
        attributes[REQUEST_ID_ATTRIBUTE] = request_id

    return _active_span(tracer, USE_CASE_SPAN_NAMES[operation], SpanKind.INTERNAL, attributes)


def invocation_span(
    tracer: Tracer,
    metadata: ModelInvocationMetadata | None,
    operation: ModelOperation,
    prompt_version: str,
    attempt: int,
) -> AbstractContextManager[ModelCallSpan]:
    if metadata is None:
        return nullcontext(_UNTRACED)

    attributes: Attributes = {
        GEN_AI_PROVIDER_NAME: metadata.provider_name,
        GEN_AI_OPERATION_NAME: metadata.operation_name,
        AI_OPERATION_ATTRIBUTE: operation,
        AI_PROMPT_VERSION_ATTRIBUTE: prompt_version,
        AI_ATTEMPT_ATTRIBUTE: attempt,
    }
    name = metadata.operation_name
    if metadata.request_model is not None:
        attributes[GEN_AI_REQUEST_MODEL] = metadata.request_model
        name = f"{metadata.operation_name} {metadata.request_model}"

    return _active_span(tracer, name, SpanKind.CLIENT, attributes)


@contextmanager
def _active_span(
    tracer: Tracer, name: str, kind: SpanKind, attributes: Attributes
) -> Iterator[ModelCallSpan]:
    # Exception messages may embed prompts, outputs, or secrets: never record them.
    with tracer.start_as_current_span(
        name,
        kind=kind,
        attributes=attributes,
        record_exception=False,
        set_status_on_exception=False,
    ) as span:
        model_call_span = ModelCallSpan(span)
        try:
            yield model_call_span
        except BaseException:
            model_call_span.record_unclassified_failure()
            raise
