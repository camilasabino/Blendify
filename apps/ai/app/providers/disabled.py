from collections.abc import Mapping

from app.providers.model_provider import ModelIntentRequest, ModelUnavailableError


class DisabledModelProvider:
    @property
    def is_available(self) -> bool:
        return False

    async def generate_intent(self, request: ModelIntentRequest) -> Mapping[str, object]:
        raise ModelUnavailableError("No model provider is configured")
