import pytest

from app.config.settings import InvalidSettingsError, load_settings
from app.interpretation.intent_interpreter import MODEL_CALL_TIMEOUT_SECONDS
from app.main import create_app
from app.providers.disabled import DisabledModelProvider
from app.providers.openai_provider import OpenAIIntentModelProvider
from app.providers.selection import select_model_provider

PRODUCTION_TOKEN = "p" * 32
OPENAI_KEY = "sk-test-openai-key-never-rendered"
OPENAI_MODEL = "gpt-test-model"
OPENAI_ENV = {"AI_PROVIDER": "openai", "AI_MODEL": OPENAI_MODEL, "OPENAI_API_KEY": OPENAI_KEY}
PRODUCTION_ENV = {
    "AI_SERVICE_ENV": "production",
    "AI_SERVICE_TOKEN": PRODUCTION_TOKEN,
    "AI_PROVIDER": "disabled",
}


def test_disabled_development_starts_without_a_service_token_model_or_key() -> None:
    settings = load_settings({"AI_PROVIDER": "disabled"})

    assert settings.environment == "development"
    assert settings.service_token is None
    assert settings.model_provider == "disabled"
    assert settings.model is None
    assert settings.openai_api_key is None


def test_production_requires_a_long_service_token() -> None:
    with pytest.raises(InvalidSettingsError, match="AI_SERVICE_TOKEN"):
        load_settings({**PRODUCTION_ENV, "AI_SERVICE_TOKEN": "short"})


def test_production_accepts_a_long_service_token() -> None:
    settings = load_settings(PRODUCTION_ENV)

    assert settings.is_production
    assert settings.service_token is not None


@pytest.mark.parametrize("environment", ["development", "production"])
def test_model_provider_must_be_explicit(environment: str) -> None:
    environ = {**PRODUCTION_ENV, "AI_SERVICE_ENV": environment}
    del environ["AI_PROVIDER"]

    with pytest.raises(InvalidSettingsError, match="AI_PROVIDER must be set explicitly"):
        load_settings(environ)


@pytest.mark.parametrize("provider", ["somevendor", "OpenAI", " "])
def test_unsupported_model_provider_is_rejected(provider: str) -> None:
    with pytest.raises(InvalidSettingsError, match="one of disabled, openai"):
        load_settings({"AI_PROVIDER": provider})


@pytest.mark.parametrize("environment", ["development", "production"])
def test_openai_provider_requires_a_model(environment: str) -> None:
    environ = {**PRODUCTION_ENV, **OPENAI_ENV, "AI_SERVICE_ENV": environment, "AI_MODEL": " "}

    with pytest.raises(InvalidSettingsError, match="AI_MODEL is required"):
        load_settings(environ)


@pytest.mark.parametrize("environment", ["development", "production"])
def test_openai_provider_requires_an_api_key(environment: str) -> None:
    environ = {**PRODUCTION_ENV, **OPENAI_ENV, "AI_SERVICE_ENV": environment}
    del environ["OPENAI_API_KEY"]

    with pytest.raises(InvalidSettingsError, match="OPENAI_API_KEY is required"):
        load_settings(environ)


def test_openai_provider_uses_exactly_the_configured_model() -> None:
    settings = load_settings({**PRODUCTION_ENV, **OPENAI_ENV})

    assert settings.model_provider == "openai"
    assert settings.model == OPENAI_MODEL


def test_unknown_environment_is_rejected() -> None:
    with pytest.raises(InvalidSettingsError):
        load_settings({"AI_SERVICE_ENV": "staging", "AI_PROVIDER": "disabled"})


def test_secrets_are_never_rendered() -> None:
    settings = load_settings({**PRODUCTION_ENV, **OPENAI_ENV})

    assert PRODUCTION_TOKEN not in repr(settings)
    assert OPENAI_KEY not in repr(settings)


def test_selects_the_openai_provider_only_when_configured() -> None:
    openai_settings = load_settings(OPENAI_ENV)

    assert isinstance(
        select_model_provider(openai_settings, MODEL_CALL_TIMEOUT_SECONDS),
        OpenAIIntentModelProvider,
    )
    assert isinstance(
        select_model_provider(
            load_settings({"AI_PROVIDER": "disabled"}), MODEL_CALL_TIMEOUT_SECONDS
        ),
        DisabledModelProvider,
    )


def test_production_app_hides_interactive_docs() -> None:
    app = create_app(load_settings(PRODUCTION_ENV))

    routes = {getattr(route, "path", None) for route in app.routes}

    assert "/docs" not in routes
    assert "/openapi.json" not in routes
