import pytest

from app.config.settings import load_settings
from app.interpretation.structured_model_call import MODEL_CALL_TIMEOUT_SECONDS
from app.main import create_app
from app.providers.disabled import DisabledModelProvider
from app.providers.model_provider import ModelProviderSetupError
from app.providers.openai.provider import OpenAIIntentModelProvider
from app.providers.registry import MODEL_PROVIDER_FACTORIES, build_model_provider


def build(environ: dict[str, str]):
    return build_model_provider(load_settings(environ), MODEL_CALL_TIMEOUT_SECONDS)


def test_registers_exactly_the_supported_providers() -> None:
    assert set(MODEL_PROVIDER_FACTORIES) == {"disabled", "openai"}


def test_disabled_needs_no_model_or_credential_and_is_unavailable() -> None:
    provider = build({"AI_PROVIDER": "disabled"})

    assert isinstance(provider, DisabledModelProvider)
    assert provider.name == "disabled"
    assert provider.is_available is False


def test_resolves_a_registered_provider_from_settings() -> None:
    provider = build({"AI_PROVIDER": "openai", "AI_MODEL": "m", "AI_PROVIDER_API_KEY": "k"})

    assert isinstance(provider, OpenAIIntentModelProvider)
    assert provider.is_available is True


@pytest.mark.parametrize("name", ["unknown", "OpenAI", "Disabled"])
def test_unknown_provider_is_rejected_clearly(name: str) -> None:
    with pytest.raises(
        ModelProviderSetupError, match="AI_PROVIDER must be one of disabled, openai"
    ):
        build({"AI_PROVIDER": name})


def test_unknown_provider_fails_application_startup_instead_of_falling_back_to_disabled() -> None:
    with pytest.raises(ModelProviderSetupError, match="AI_PROVIDER must be one of"):
        create_app(load_settings({"AI_PROVIDER": "unknown"}))


def test_provider_requirements_name_the_generic_variables() -> None:
    with pytest.raises(ModelProviderSetupError, match="AI_MODEL is required"):
        build({"AI_PROVIDER": "openai", "AI_PROVIDER_API_KEY": "k"})

    with pytest.raises(ModelProviderSetupError, match="AI_PROVIDER_API_KEY is required") as raised:
        build({"AI_PROVIDER": "openai", "AI_MODEL": "m"})

    assert "OPENAI_API_KEY" not in str(raised.value)


def test_the_credential_never_appears_in_setup_errors() -> None:
    key = "sk-test-key-that-must-never-be-rendered"

    with pytest.raises(ModelProviderSetupError) as raised:
        build({"AI_PROVIDER": "nope", "AI_MODEL": "m", "AI_PROVIDER_API_KEY": key})

    assert key not in str(raised.value)
