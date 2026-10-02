import asyncio
import time
from typing import Protocol

from opentelemetry.trace import TracerProvider
from pydantic import ValidationError

from app.errors import AiServiceError
from app.models.service import AiServiceErrorCode
from app.observability.model_call_log import (
    ModelCallRecord,
    ModelCallResult,
    ModelOperation,
    ModelRequestRecord,
    ModelRequestResult,
    log_model_call,
    log_model_request,
)
from app.observability.model_call_tracing import (
    ModelCallSpan,
    invocation_span,
    model_call_tracer,
    use_case_span,
)
from app.providers.model_provider import (
    IntentModelProvider,
    ModelConfigurationError,
    ModelConfigurationReason,
    ModelIntentRequest,
    ModelIntentResult,
    ModelInvalidOutputError,
    ModelRateLimitedError,
    ModelTimeoutError,
    ModelTokenUsage,
    ModelUnavailableError,
)

MAX_OUTPUT_VALIDATION_ATTEMPTS = 2
MODEL_CALL_TIMEOUT_SECONDS = 12.0

ERROR_CODE_BY_REQUEST_RESULT: dict[ModelRequestResult, AiServiceErrorCode] = {
    "timeout": "MODEL_TIMEOUT",
    "rate_limited": "MODEL_RATE_LIMITED",
    "unavailable": "MODEL_UNAVAILABLE",
    "misconfigured": "MODEL_UNAVAILABLE",
}


class StructuredResult(Protocol):
    @property
    def outcome(self) -> str: ...


class StructuredResultValidator[ResultT: StructuredResult](Protocol):
    def validate_python(self, payload: object) -> ResultT: ...


class _ProviderRequestFailedError(Exception):
    def __init__(
        self,
        result: ModelRequestResult,
        configuration_reason: ModelConfigurationReason | None = None,
    ) -> None:
        super().__init__(result)
        self.result: ModelRequestResult = result
        self.configuration_reason = configuration_reason


class _ModelCallTrace:
    def __init__(
        self,
        operation: ModelOperation,
        provider: str,
        model_request: ModelIntentRequest,
        span: ModelCallSpan,
    ) -> None:
        self._operation: ModelOperation = operation
        self._provider = provider
        self._prompt_version = model_request.prompt_version
        self._span = span
        self._started_at = time.monotonic()
        self._requests: list[ModelRequestRecord] = []
        self.model: str | None = None

    def record_request(
        self,
        span: ModelCallSpan,
        attempt: int,
        result: ModelRequestResult,
        started_at: float,
        *,
        model: str | None = None,
        usage: ModelTokenUsage | None = None,
        validation_error_count: int | None = None,
        configuration_reason: ModelConfigurationReason | None = None,
    ) -> None:
        self.model = model or self.model
        record = ModelRequestRecord(
            operation=self._operation,
            provider=self._provider,
            model=self.model,
            prompt_version=self._prompt_version,
            attempt=attempt,
            result=result,
            duration_ms=_elapsed_ms(started_at),
            usage=usage,
            validation_error_count=validation_error_count,
            configuration_reason=configuration_reason,
        )
        self._requests.append(record)
        span.record_request(record, response_model=model)
        log_model_request(record)

    def completed(self, outcome: str) -> None:
        self._finish("completed", outcome, None)

    def failed(self, error_code: AiServiceErrorCode) -> None:
        self._finish("failed", None, error_code)

    def _finish(
        self,
        result: ModelCallResult,
        outcome: str | None,
        error_code: AiServiceErrorCode | None,
    ) -> None:
        record = ModelCallRecord(
            operation=self._operation,
            provider=self._provider,
            model=self.model,
            prompt_version=self._prompt_version,
            result=result,
            outcome=outcome,
            error_code=error_code,
            requests=tuple(self._requests),
            duration_ms=_elapsed_ms(self._started_at),
        )
        self._span.record_call(record)
        log_model_call(record)


class StructuredModelCaller:
    def __init__(
        self,
        provider: IntentModelProvider,
        *,
        operation: ModelOperation,
        model_call_timeout_seconds: float,
        max_output_validation_attempts: int,
        tracer_provider: TracerProvider | None = None,
    ) -> None:
        self._provider = provider
        self._operation: ModelOperation = operation
        self._model_call_timeout_seconds = model_call_timeout_seconds
        self._max_output_validation_attempts = max_output_validation_attempts
        self._tracer = model_call_tracer(tracer_provider)

    @property
    def is_available(self) -> bool:
        return self._provider.is_available

    async def call[ResultT: StructuredResult](
        self,
        model_request: ModelIntentRequest,
        validator: StructuredResultValidator[ResultT],
    ) -> ResultT:
        prompt_version = model_request.prompt_version
        with use_case_span(self._tracer, self._operation, prompt_version) as call_span:
            trace = _ModelCallTrace(self._operation, self._provider.name, model_request, call_span)

            for attempt in range(1, self._max_output_validation_attempts + 1):
                try:
                    with invocation_span(
                        self._tracer,
                        self._provider.invocation_metadata,
                        self._operation,
                        prompt_version,
                        attempt,
                    ) as request_span:
                        result = await self._attempt(
                            model_request, validator, trace, request_span, attempt
                        )
                except _ProviderRequestFailedError as error:
                    error_code = ERROR_CODE_BY_REQUEST_RESULT[error.result]
                    trace.failed(error_code)
                    raise AiServiceError(error_code) from None

                if result is not None:
                    trace.completed(result.outcome)
                    return result

            trace.failed("INVALID_MODEL_OUTPUT")
            raise AiServiceError("INVALID_MODEL_OUTPUT")

    async def _attempt[ResultT: StructuredResult](
        self,
        model_request: ModelIntentRequest,
        validator: StructuredResultValidator[ResultT],
        trace: _ModelCallTrace,
        span: ModelCallSpan,
        attempt: int,
    ) -> ResultT | None:
        started_at = time.monotonic()
        try:
            generated = await self._generate(model_request)
        except ModelInvalidOutputError as error:
            trace.record_request(
                span, attempt, "invalid_output", started_at, model=error.model, usage=error.usage
            )
            return None
        except _ProviderRequestFailedError as error:
            trace.record_request(
                span,
                attempt,
                error.result,
                started_at,
                configuration_reason=error.configuration_reason,
            )
            raise

        try:
            result = validator.validate_python(generated.payload)
        except ValidationError as error:
            trace.record_request(
                span,
                attempt,
                "invalid_output",
                started_at,
                model=generated.model,
                usage=generated.usage,
                validation_error_count=error.error_count(),
            )
            return None

        trace.record_request(
            span, attempt, "ok", started_at, model=generated.model, usage=generated.usage
        )
        return result

    async def _generate(self, model_request: ModelIntentRequest) -> ModelIntentResult:
        try:
            return await asyncio.wait_for(
                self._provider.generate_intent(model_request),
                timeout=self._model_call_timeout_seconds,
            )
        except (TimeoutError, ModelTimeoutError):
            raise _ProviderRequestFailedError("timeout") from None
        except ModelRateLimitedError:
            raise _ProviderRequestFailedError("rate_limited") from None
        except ModelConfigurationError as error:
            raise _ProviderRequestFailedError("misconfigured", error.reason) from None
        except ModelUnavailableError:
            raise _ProviderRequestFailedError("unavailable") from None


def _elapsed_ms(started_at: float) -> int:
    return round((time.monotonic() - started_at) * 1000)
