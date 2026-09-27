import asyncio
import json
import logging
import time
from collections.abc import Mapping

from pydantic import ValidationError

from app.errors import AiServiceError
from app.models.intent import intent_interpretation_adapter
from app.models.interpretation import InterpretIntentRequest, InterpretIntentResponse
from app.prompts.intent import build_intent_model_request
from app.providers.model_provider import (
    IntentModelProvider,
    ModelIntentRequest,
    ModelRateLimitedError,
    ModelTimeoutError,
    ModelUnavailableError,
)

MAX_OUTPUT_VALIDATION_ATTEMPTS = 2
MODEL_CALL_TIMEOUT_SECONDS = 12.0

logger = logging.getLogger(__name__)


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

        for attempt in range(1, self._max_output_validation_attempts + 1):
            raw_output = await self._generate(model_request)

            try:
                result = intent_interpretation_adapter.validate_python(raw_output)
            except ValidationError as error:
                _log_event(
                    logging.WARNING,
                    "intent.output_invalid",
                    promptVersion=model_request.prompt_version,
                    attempt=attempt,
                    errorCount=error.error_count(),
                )
                continue

            _log_event(
                logging.INFO,
                "intent.interpreted",
                promptVersion=model_request.prompt_version,
                outcome=result.outcome,
                attempts=attempt,
                durationMs=_elapsed_ms(started_at),
            )
            return InterpretIntentResponse.model_validate(
                {"promptVersion": model_request.prompt_version, "result": result}
            )

        _log_event(
            logging.WARNING,
            "intent.failed",
            promptVersion=model_request.prompt_version,
            category="INVALID_MODEL_OUTPUT",
            durationMs=_elapsed_ms(started_at),
        )
        raise AiServiceError("INVALID_MODEL_OUTPUT")

    async def _generate(self, model_request: ModelIntentRequest) -> Mapping[str, object]:
        try:
            return await asyncio.wait_for(
                self._provider.generate_intent(model_request),
                timeout=self._model_call_timeout_seconds,
            )
        except (TimeoutError, ModelTimeoutError) as error:
            raise AiServiceError("MODEL_TIMEOUT") from error
        except ModelRateLimitedError as error:
            raise AiServiceError("MODEL_RATE_LIMITED") from error
        except ModelUnavailableError as error:
            raise AiServiceError("MODEL_UNAVAILABLE") from error


def _elapsed_ms(started_at: float) -> int:
    return round((time.monotonic() - started_at) * 1000)


def _log_event(level: int, event: str, **fields: object) -> None:
    logger.log(level, json.dumps({"event": event, **fields}))
