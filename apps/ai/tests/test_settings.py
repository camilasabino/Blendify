import pytest

from app.config.settings import InvalidSettingsError, load_settings
from app.main import create_app
from tests.fakes import ScriptedModelProvider

PRODUCTION_TOKEN = "p" * 32
PROVIDER_KEY = "sk-test-provider-key-never-rendered"
MODEL = "test-model"
PROVIDER_ENV = {"AI_PROVIDER": "fake", "AI_MODEL": MODEL, "AI_PROVIDER_API_KEY": PROVIDER_KEY}
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
    assert settings.provider_api_key is None


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


def test_blank_model_provider_is_rejected() -> None:
    with pytest.raises(InvalidSettingsError, match="AI_PROVIDER must be set explicitly"):
        load_settings({"AI_PROVIDER": " "})


def test_settings_carry_any_provider_name_and_leave_validation_to_the_registry() -> None:
    settings = load_settings({**PROVIDER_ENV, "AI_PROVIDER": "somevendor"})

    assert settings.model_provider == "somevendor"
    assert settings.model == MODEL
    assert settings.provider_api_key is not None
    assert settings.provider_api_key.get_secret_value() == PROVIDER_KEY


def test_model_is_an_opaque_string() -> None:
    settings = load_settings({**PROVIDER_ENV, "AI_MODEL": "  Any/Model:Name-1  "})

    assert settings.model == "Any/Model:Name-1"


def test_unknown_environment_is_rejected() -> None:
    with pytest.raises(InvalidSettingsError):
        load_settings({"AI_SERVICE_ENV": "staging", "AI_PROVIDER": "disabled"})


def test_secrets_are_never_rendered() -> None:
    settings = load_settings({**PRODUCTION_ENV, **PROVIDER_ENV})

    assert PRODUCTION_TOKEN not in repr(settings)
    assert PROVIDER_KEY not in repr(settings)
    assert PROVIDER_KEY not in str(settings.model_dump())


def test_the_provider_key_is_not_kept_on_application_state() -> None:
    settings = load_settings({**PRODUCTION_ENV, **PROVIDER_ENV})
    provider = ScriptedModelProvider([])

    app = create_app(settings, provider)

    assert app.state.settings.provider_api_key is None
    assert PROVIDER_KEY not in repr(app.state.settings)


def test_production_app_hides_interactive_docs() -> None:
    app = create_app(load_settings(PRODUCTION_ENV))

    routes = {getattr(route, "path", None) for route in app.routes}

    assert "/docs" not in routes
    assert "/openapi.json" not in routes
