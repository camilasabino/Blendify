from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.config.settings import Settings
from app.main import create_app
from app.providers.model_provider import IntentModelProvider

SERVICE_TOKEN = "test-service-token-with-at-least-32-characters"
AUTH_HEADERS = {"Authorization": f"Bearer {SERVICE_TOKEN}"}

ClientFactory = Callable[..., TestClient]


@pytest.fixture
def settings() -> Settings:
    return Settings(environment="development", service_token=SecretStr(SERVICE_TOKEN))


@pytest.fixture
def make_client(settings: Settings) -> ClientFactory:
    def factory(
        provider: IntentModelProvider | None = None,
        service_settings: Settings | None = None,
    ) -> TestClient:
        app = create_app(settings=service_settings or settings, provider=provider)
        return TestClient(app, raise_server_exceptions=False)

    return factory
