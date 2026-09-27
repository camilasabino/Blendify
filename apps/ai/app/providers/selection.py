from app.config.settings import Settings
from app.providers.disabled import DisabledModelProvider
from app.providers.model_provider import IntentModelProvider
from app.providers.openai_provider import OpenAIIntentModelProvider


def select_model_provider(settings: Settings, timeout_seconds: float) -> IntentModelProvider:
    if (
        settings.model_provider == "openai"
        and settings.model is not None
        and settings.openai_api_key is not None
    ):
        return OpenAIIntentModelProvider(
            api_key=settings.openai_api_key.get_secret_value(),
            model=settings.model,
            timeout_seconds=timeout_seconds,
        )
    return DisabledModelProvider()
