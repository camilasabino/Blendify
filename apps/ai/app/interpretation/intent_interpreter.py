from app.interpretation.structured_model_call import (
    MAX_OUTPUT_VALIDATION_ATTEMPTS,
    MODEL_CALL_TIMEOUT_SECONDS,
    StructuredModelCaller,
)
from app.models.intent import intent_interpretation_adapter
from app.models.interpretation import InterpretIntentRequest, InterpretIntentResponse
from app.prompts.intent import build_intent_model_request
from app.providers.model_provider import IntentModelProvider


class IntentInterpreter:
    def __init__(
        self,
        provider: IntentModelProvider,
        *,
        model_call_timeout_seconds: float = MODEL_CALL_TIMEOUT_SECONDS,
        max_output_validation_attempts: int = MAX_OUTPUT_VALIDATION_ATTEMPTS,
    ) -> None:
        self._caller = StructuredModelCaller(
            provider,
            operation="intent_interpretation",
            model_call_timeout_seconds=model_call_timeout_seconds,
            max_output_validation_attempts=max_output_validation_attempts,
        )

    @property
    def is_available(self) -> bool:
        return self._caller.is_available

    async def interpret(self, request: InterpretIntentRequest) -> InterpretIntentResponse:
        model_request = build_intent_model_request(request.prompt)
        result = await self._caller.call(model_request, intent_interpretation_adapter)

        return InterpretIntentResponse.model_validate(
            {"promptVersion": model_request.prompt_version, "result": result}
        )
