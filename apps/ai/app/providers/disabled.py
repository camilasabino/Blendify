from app.providers.model_provider import (
    ModelIntentRequest,
    ModelIntentResult,
    ModelInvocationMetadata,
    ModelUnavailableError,
)

DISABLED_PROVIDER_NAME = "disabled"


class DisabledModelProvider:
    @property
    def name(self) -> str:
        return DISABLED_PROVIDER_NAME

    @property
    def is_available(self) -> bool:
        return False

    @property
    def invocation_metadata(self) -> ModelInvocationMetadata | None:
        return None

    async def generate_intent(self, request: ModelIntentRequest) -> ModelIntentResult:
        raise ModelUnavailableError("No model provider is configured")
