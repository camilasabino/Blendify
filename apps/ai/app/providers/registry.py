from collections.abc import Callable, Mapping

from app.config.settings import Settings
from app.providers.disabled import DISABLED_PROVIDER_NAME, DisabledModelProvider
from app.providers.model_provider import (
    IntentModelProvider,
    ModelProviderConfig,
    ModelProviderSetupError,
)
from app.providers.openai.provider import OPENAI_PROVIDER_NAME, build_openai_provider

ProviderFactory = Callable[[ModelProviderConfig], IntentModelProvider]

MODEL_PROVIDER_FACTORIES: Mapping[str, ProviderFactory] = {
    DISABLED_PROVIDER_NAME: lambda _config: DisabledModelProvider(),
    OPENAI_PROVIDER_NAME: build_openai_provider,
}


def build_model_provider(settings: Settings, timeout_seconds: float) -> IntentModelProvider:
    factory = MODEL_PROVIDER_FACTORIES.get(settings.model_provider)
    if factory is None:
        supported = ", ".join(MODEL_PROVIDER_FACTORIES)
        raise ModelProviderSetupError(
            f"AI_PROVIDER must be one of {supported}, got {settings.model_provider!r}"
        )

    return factory(
        ModelProviderConfig(
            model=settings.model,
            api_key=settings.provider_api_key,
            timeout_seconds=timeout_seconds,
        )
    )
