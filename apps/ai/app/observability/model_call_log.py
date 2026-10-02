import json
import logging
from dataclasses import dataclass
from typing import Literal

from opentelemetry import trace

from app.models.service import AiServiceErrorCode
from app.observability.request_correlation import current_request_id
from app.providers.model_provider import ModelConfigurationReason, ModelTokenUsage

MODEL_REQUEST_EVENT = "ai.model_request"
MODEL_CALL_EVENT = "ai.model_call"

ModelOperation = Literal["intent_interpretation", "refinement_interpretation"]
ModelRequestResult = Literal[
    "ok", "invalid_output", "timeout", "rate_limited", "unavailable", "misconfigured"
]
ModelCallResult = Literal["completed", "failed"]

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class ModelRequestRecord:
    operation: ModelOperation
    provider: str
    model: str | None
    prompt_version: str
    attempt: int
    result: ModelRequestResult
    duration_ms: int
    usage: ModelTokenUsage | None
    validation_error_count: int | None = None
    configuration_reason: ModelConfigurationReason | None = None


@dataclass(frozen=True, slots=True)
class ModelCallRecord:
    operation: ModelOperation
    provider: str
    model: str | None
    prompt_version: str
    result: ModelCallResult
    outcome: str | None
    error_code: AiServiceErrorCode | None
    requests: tuple[ModelRequestRecord, ...]
    duration_ms: int


def log_model_request(record: ModelRequestRecord) -> None:
    level = logging.INFO if record.result == "ok" else logging.WARNING
    _emit(
        level,
        MODEL_REQUEST_EVENT,
        {
            "operation": record.operation,
            "provider": record.provider,
            "model": record.model,
            "promptVersion": record.prompt_version,
            "attempt": record.attempt,
            "result": record.result,
            "durationMs": record.duration_ms,
            **_usage_fields([record.usage]),
            "validationErrorCount": record.validation_error_count,
            "configurationReason": record.configuration_reason,
        },
    )


def log_model_call(record: ModelCallRecord) -> None:
    level = logging.INFO if record.result == "completed" else logging.WARNING
    usages = [request.usage for request in record.requests]
    _emit(
        level,
        MODEL_CALL_EVENT,
        {
            "operation": record.operation,
            "provider": record.provider,
            "model": record.model,
            "promptVersion": record.prompt_version,
            "result": record.result,
            "outcome": record.outcome,
            "errorCode": record.error_code,
            "modelRequests": len(record.requests),
            "durationMs": record.duration_ms,
            **_usage_fields(usages),
            "usageComplete": bool(usages) and all(usage is not None for usage in usages),
        },
    )


def _usage_fields(usages: list[ModelTokenUsage | None]) -> dict[str, int | None]:
    reported = [usage for usage in usages if usage is not None]
    if not reported:
        return {"inputTokens": None, "outputTokens": None, "totalTokens": None}
    return {
        "inputTokens": sum(usage.input_tokens for usage in reported),
        "outputTokens": sum(usage.output_tokens for usage in reported),
        "totalTokens": sum(usage.total_tokens for usage in reported),
    }


def _trace_correlation() -> dict[str, str]:
    span_context = trace.get_current_span().get_span_context()
    if not span_context.is_valid:
        return {}
    return {
        "traceId": trace.format_trace_id(span_context.trace_id),
        "spanId": trace.format_span_id(span_context.span_id),
    }


def _emit(level: int, event: str, fields: dict[str, object]) -> None:
    try:
        logger.log(
            level,
            json.dumps(
                {
                    "event": event,
                    "requestId": current_request_id(),
                    **_trace_correlation(),
                    **fields,
                }
            ),
        )
    except Exception:
        return
