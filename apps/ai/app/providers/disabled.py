from app.providers.model_provider import (
    ModelIntentRequest,
    ModelIntentResult,
    ModelUnavailableError,
)


class DisabledModelProvider:
    @property
    def is_available(self) -> bool:
        return False

    async def generate_intent(self, request: ModelIntentRequest) -> ModelIntentResult:
        raise ModelUnavailableError("No model provider is configured")
