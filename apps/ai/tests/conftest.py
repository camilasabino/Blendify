from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.config.settings import Settings
from app.main import create_app
from app.providers.model_provider import IntentModelProvider

SERVICE_TOKEN = "test-service-token-with-at-least-32-characters"
AUTH_HEADERS = {"Authorization": f"Bearer {SERVICE_TOKEN}"}

PAID_PROVIDER_VARIABLES = ("AI_PROVIDER", "AI_MODEL", "OPENAI_API_KEY", "ALLOW_PAID_AI_EVALS")

ClientFactory = Callable[..., TestClient]


@pytest.fixture(autouse=True)
def isolate_from_paid_provider_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in PAID_PROVIDER_VARIABLES:
        monkeypatch.delenv(name, raising=False)


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
def settings() -> Settings:
    return Settings(
        environment="development",
        service_token=SecretStr(SERVICE_TOKEN),
        model_provider="disabled",
    )


@pytest.fixture
def make_client(settings: Settings) -> ClientFactory:
    def factory(
        provider: IntentModelProvider | None = None,
        service_settings: Settings | None = None,
    ) -> TestClient:
        app = create_app(settings=service_settings or settings, provider=provider)
        return TestClient(app, raise_server_exceptions=False)

    return factory
