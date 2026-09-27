import asyncio
import json
import logging
import time

from pydantic import ValidationError

from app.errors import AiServiceError
from app.models.intent import intent_interpretation_adapter
from app.models.interpretation import InterpretIntentRequest, InterpretIntentResponse
from app.models.service import AiServiceErrorCode
from app.prompts.intent import build_intent_model_request
from app.providers.model_provider import (
    IntentModelProvider,
    ModelConfigurationError,
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

logger = logging.getLogger(__name__)


class _TokenTally:
    def __init__(self) -> None:
        self.input_tokens = 0
        self.output_tokens = 0
        self.reported = False

    def add(self, usage: ModelTokenUsage | None) -> None:
        if usage is None:
            return
        self.reported = True
        self.input_tokens += usage.input_tokens
        self.output_tokens += usage.output_tokens

    def log_fields(self) -> dict[str, int | None]:
        if not self.reported:
            return {"inputTokens": None, "outputTokens": None}
        return {"inputTokens": self.input_tokens, "outputTokens": self.output_tokens}


class IntentInterpreter:
    def __init__(
        self,
        provider: IntentModelProvider,
        *,
        model_call_timeout_seconds: float = MODEL_CALL_TIMEOUT_SECONDS,
        max_output_validation_attempts: int = MAX_OUTPUT_VALIDATION_ATTEMPTS,
    ) -> None:
        self._provider = provider
        self._model_call_timeout_seconds = model_call_timeout_seconds
        self._max_output_validation_attempts = max_output_validation_attempts

    @property
    def is_available(self) -> bool:
        return self._provider.is_available

    async def interpret(self, request: InterpretIntentRequest) -> InterpretIntentResponse:
        model_request = build_intent_model_request(request.prompt)
        started_at = time.monotonic()
        tokens = _TokenTally()
        model: str | None = None

        for attempt in range(1, self._max_output_validation_attempts + 1):
            try:
                generated = await self._generate(model_request)
            except ModelInvalidOutputError:
                _log_invalid_output(model_request, attempt, error_count=None)
                continue
            except AiServiceError as error:
                _log_failure(model_request, error.code, started_at, tokens, model)
                raise

            model = generated.model
            tokens.add(generated.usage)

            try:
                result = intent_interpretation_adapter.validate_python(generated.payload)
            except ValidationError as error:
                _log_invalid_output(model_request, attempt, error_count=error.error_count())
                continue

            _log_event(
                logging.INFO,
                "intent.interpreted",
                model=model,
                promptVersion=model_request.prompt_version,
                outcome=result.outcome,
                attempts=attempt,
                durationMs=_elapsed_ms(started_at),
                **tokens.log_fields(),
            )
            return InterpretIntentResponse.model_validate(
                {"promptVersion": model_request.prompt_version, "result": result}
            )

        _log_failure(model_request, "INVALID_MODEL_OUTPUT", started_at, tokens, model)
        raise AiServiceError("INVALID_MODEL_OUTPUT")

    async def _generate(self, model_request: ModelIntentRequest) -> ModelIntentResult:
        try:
            return await asyncio.wait_for(
                self._provider.generate_intent(model_request),
                timeout=self._model_call_timeout_seconds,
            )
        except (TimeoutError, ModelTimeoutError) as error:
            raise AiServiceError("MODEL_TIMEOUT") from error
        except ModelRateLimitedError as error:
            raise AiServiceError("MODEL_RATE_LIMITED") from error
        except ModelConfigurationError as error:
            _log_event(logging.ERROR, "intent.provider_misconfigured", reason=str(error))
            raise AiServiceError("MODEL_UNAVAILABLE") from error
        except ModelUnavailableError as error:
            raise AiServiceError("MODEL_UNAVAILABLE") from error


def _log_invalid_output(
    model_request: ModelIntentRequest, attempt: int, error_count: int | None
) -> None:
    _log_event(
        logging.WARNING,
        "intent.output_invalid",
        promptVersion=model_request.prompt_version,
        attempt=attempt,
        errorCount=error_count,
    )


def _log_failure(
    model_request: ModelIntentRequest,
    category: AiServiceErrorCode,
    started_at: float,
    tokens: _TokenTally,
    model: str | None,
) -> None:
    _log_event(
        logging.WARNING,
        "intent.failed",
        model=model,
        promptVersion=model_request.prompt_version,
        category=category,
        durationMs=_elapsed_ms(started_at),
        **tokens.log_fields(),
    )


def _elapsed_ms(started_at: float) -> int:
    return round((time.monotonic() - started_at) * 1000)


def _log_event(level: int, event: str, **fields: object) -> None:
    logger.log(level, json.dumps({"event": event, **fields}))
