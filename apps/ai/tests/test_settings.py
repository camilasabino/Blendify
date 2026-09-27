import pytest

from app.config.settings import InvalidSettingsError, load_settings
from app.main import create_app

PRODUCTION_TOKEN = "p" * 32


def test_development_defaults_start_without_a_service_token() -> None:
    settings = load_settings({})

    assert settings.environment == "development"
    assert settings.service_token is None


def test_production_requires_a_long_service_token() -> None:
    with pytest.raises(InvalidSettingsError, match="AI_SERVICE_TOKEN"):
        load_settings({"AI_SERVICE_ENV": "production", "AI_SERVICE_TOKEN": "short"})


def test_production_accepts_a_long_service_token() -> None:
    settings = load_settings({"AI_SERVICE_ENV": "production", "AI_SERVICE_TOKEN": PRODUCTION_TOKEN})

    assert settings.is_production
    assert settings.service_token is not None


def test_unknown_environment_is_rejected() -> None:
    with pytest.raises(InvalidSettingsError):
        load_settings({"AI_SERVICE_ENV": "staging"})


def test_service_token_is_never_rendered() -> None:
    settings = load_settings({"AI_SERVICE_ENV": "production", "AI_SERVICE_TOKEN": PRODUCTION_TOKEN})

    assert PRODUCTION_TOKEN not in repr(settings)


def test_production_app_hides_interactive_docs() -> None:
    settings = load_settings({"AI_SERVICE_ENV": "production", "AI_SERVICE_TOKEN": PRODUCTION_TOKEN})

    routes = {getattr(route, "path", None) for route in create_app(settings=settings).routes}

    assert "/docs" not in routes
    assert "/openapi.json" not in routes
