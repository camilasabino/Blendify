import json
import logging
from collections.abc import Callable
from typing import Any

import httpx2
import pytest
from pydantic import SecretStr

from app.config.settings import Settings
from app.prompts.intent import (
    INTENT_MODEL_OUTPUT,
    INTENT_PROMPT_VERSION,
    build_intent_model_request,
)
from app.providers.model_provider import (
    ModelConfigurationError,
    ModelInvalidOutputError,
    ModelProviderConfig,
    ModelProviderSetupError,
    ModelRateLimitedError,
    ModelTimeoutError,
    ModelTokenUsage,
    ModelUnavailableError,
)
from app.providers.openai.provider import (
    MODEL_MAX_OUTPUT_TOKENS,
    OpenAIIntentModelProvider,
    build_openai_provider,
)
from tests.conftest import AUTH_HEADERS, ClientFactory
from tests.fakes import interpreted_output

API_KEY = "sk-test-key-that-must-never-be-logged"
MODEL = "gpt-5.6-luna"
PROMPT = "30 deep cuts from Radiohead and Interpol, no Coldplay"

Handler = Callable[[httpx2.Request], httpx2.Response]

pytestmark = pytest.mark.anyio


def responses_body(
    output_text: str | None = None,
    *,
    status: str = "completed",
    content: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    text = output_text if output_text is not None else json.dumps({"result": interpreted_output()})
    return {
        "id": "resp_test",
        "object": "response",
        "created_at": 1_790_000_000,
        "status": status,
        "model": f"{MODEL}-2026-09-01",
        "output": [
            {
                "type": "message",
                "id": "msg_test",
                "role": "assistant",
                "status": "completed",
                "content": content or [{"type": "output_text", "text": text, "annotations": []}],
            }
        ],
        "usage": {
            "input_tokens": 812,
            "output_tokens": 95,
            "total_tokens": 907,
            "input_tokens_details": {"cached_tokens": 0},
            "output_tokens_details": {"reasoning_tokens": 0},
        },
    }


def error_body(code: str) -> dict[str, Any]:
    return {"error": {"message": "provider message", "type": code, "code": code, "param": None}}


def build_provider(handler: Handler) -> OpenAIIntentModelProvider:
    return OpenAIIntentModelProvider(
        api_key=API_KEY,
        model=MODEL,
        timeout_seconds=5.0,
        http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(handler)),
    )


def json_handler(status_code: int, body: dict[str, Any]) -> Handler:
    return lambda _request: httpx2.Response(status_code, json=body)


async def generate(handler: Handler):
    return await build_provider(handler).generate_intent(build_intent_model_request(PROMPT))


async def test_returns_the_structured_result_with_model_and_token_usage() -> None:
    result = await generate(json_handler(200, responses_body()))

    assert result.payload == interpreted_output()
    assert result.model == f"{MODEL}-2026-09-01"
    assert result.usage == ModelTokenUsage(input_tokens=812, output_tokens=95, total_tokens=907)


async def test_requests_strict_structured_output_without_tools_or_storage() -> None:
    captured: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        captured.append(request)
        return httpx2.Response(200, json=responses_body())

    await generate(handler)

    [request] = captured
    body = json.loads(request.content)
    assert request.url.path.endswith("/responses")
    assert request.headers["authorization"] == f"Bearer {API_KEY}"
    assert body["model"] == MODEL
    assert body["input"] == PROMPT
    assert body["instructions"] == build_intent_model_request(PROMPT).system_prompt
    assert body["store"] is False
    assert body["max_output_tokens"] == MODEL_MAX_OUTPUT_TOKENS
    assert "tools" not in body
    assert body["text"]["format"]["type"] == "json_schema"
    assert body["text"]["format"]["name"] == INTENT_MODEL_OUTPUT.name
    assert body["text"]["format"]["strict"] is True


@pytest.mark.parametrize(
    ("status_code", "code", "expected"),
    [
        (429, "rate_limit_exceeded", ModelRateLimitedError),
        (429, "insufficient_quota", ModelConfigurationError),
        (401, "invalid_api_key", ModelConfigurationError),
        (404, "model_not_found", ModelConfigurationError),
        (400, "invalid_json_schema", ModelConfigurationError),
        (500, "server_error", ModelUnavailableError),
        (503, "service_unavailable", ModelUnavailableError),
    ],
)
async def test_maps_provider_status_errors(
    status_code: int, code: str, expected: type[Exception]
) -> None:
    with pytest.raises(expected):
        await generate(json_handler(status_code, error_body(code)))


async def test_maps_a_transport_timeout() -> None:
    def handler(request: httpx2.Request) -> httpx2.Response:
        raise httpx2.ReadTimeout("timed out", request=request)

    with pytest.raises(ModelTimeoutError):
        await generate(handler)


async def test_maps_a_connection_failure_to_unavailable() -> None:
    def handler(request: httpx2.Request) -> httpx2.Response:
        raise httpx2.ConnectError("refused", request=request)

    with pytest.raises(ModelUnavailableError):
        await generate(handler)


@pytest.mark.parametrize(
    "body",
    [
        responses_body("not json"),
        responses_body(json.dumps({"unexpected": True})),
        responses_body(json.dumps([1, 2])),
        responses_body(status="incomplete"),
        responses_body(content=[{"type": "refusal", "refusal": "I can't help with that."}]),
    ],
    ids=["prose", "missing-result", "not-an-object", "incomplete", "refusal"],
)
async def test_rejects_unusable_model_output(body: dict[str, Any]) -> None:
    with pytest.raises(ModelInvalidOutputError):
        await generate(json_handler(200, body))


async def test_invalid_output_keeps_the_usage_of_that_model_request() -> None:
    with pytest.raises(ModelInvalidOutputError) as raised:
        await generate(json_handler(200, responses_body("not json")))

    assert raised.value.model == f"{MODEL}-2026-09-01"
    assert raised.value.usage == ModelTokenUsage(
        input_tokens=812, output_tokens=95, total_tokens=907
    )


@pytest.mark.parametrize(
    ("status_code", "code", "reason"),
    [
        (401, "invalid_api_key", "authentication"),
        (403, "permission_denied", "permission_denied"),
        (404, "model_not_found", "not_found"),
        (400, "invalid_request_error", "bad_request"),
        (429, "insufficient_quota", "insufficient_quota"),
    ],
)
async def test_maps_configuration_failures_to_bounded_reasons(
    status_code: int, code: str, reason: str
) -> None:
    with pytest.raises(ModelConfigurationError) as raised:
        await generate(json_handler(status_code, error_body(code)))

    assert raised.value.reason == reason


def test_interprets_end_to_end_through_the_service_without_logging_secrets_or_content(
    make_client: ClientFactory, settings: Settings, caplog: pytest.LogCaptureFixture
) -> None:
    provider = build_provider(json_handler(200, responses_body()))

    with caplog.at_level(logging.DEBUG):
        response = make_client(provider).post(
            "/v1/intent/interpret", json={"prompt": PROMPT}, headers=AUTH_HEADERS
        )

    assert response.status_code == 200
    assert response.json() == {
        "promptVersion": INTENT_PROMPT_VERSION,
        "result": interpreted_output(),
    }
    logged = "\n".join(record.getMessage() for record in caplog.records)
    assert PROMPT not in logged
    assert API_KEY not in logged
    assert "Radiohead" not in logged
    assert '"inputTokens": 812' in logged


def test_retries_once_and_then_reports_invalid_model_output(make_client: ClientFactory) -> None:
    calls: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        calls.append(request)
        return httpx2.Response(200, json=responses_body("not json"))

    response = make_client(build_provider(handler)).post(
        "/v1/intent/interpret", json={"prompt": PROMPT}, headers=AUTH_HEADERS
    )

    assert response.status_code == 502
    assert response.json()["code"] == "INVALID_MODEL_OUTPUT"
    assert len(calls) == 2


@pytest.mark.parametrize(
    ("status_code", "code", "service_status", "service_code"),
    [
        (429, "rate_limit_exceeded", 429, "MODEL_RATE_LIMITED"),
        (401, "invalid_api_key", 503, "MODEL_UNAVAILABLE"),
        (500, "server_error", 503, "MODEL_UNAVAILABLE"),
    ],
)
def test_service_normalizes_provider_failures(
    make_client: ClientFactory,
    status_code: int,
    code: str,
    service_status: int,
    service_code: str,
) -> None:
    provider = build_provider(json_handler(status_code, error_body(code)))

    response = make_client(provider).post(
        "/v1/intent/interpret", json={"prompt": PROMPT}, headers=AUTH_HEADERS
    )

    assert response.status_code == service_status
    assert response.json()["code"] == service_code


async def test_does_not_retry_transient_failures_inside_the_sdk() -> None:
    calls: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        calls.append(request)
        return httpx2.Response(500, json=error_body("server_error"))

    with pytest.raises(ModelUnavailableError):
        await generate(handler)

    assert len(calls) == 1


def test_keeps_the_sdk_logger_from_emitting_request_bodies() -> None:
    sdk_logger = logging.getLogger("openai")
    sdk_logger.setLevel(logging.DEBUG)

    build_provider(json_handler(200, responses_body()))

    assert sdk_logger.level == logging.WARNING


def test_the_factory_builds_the_adapter_from_the_generic_configuration() -> None:
    provider = build_openai_provider(
        ModelProviderConfig(model=MODEL, api_key=SecretStr(API_KEY), timeout_seconds=5.0)
    )

    assert isinstance(provider, OpenAIIntentModelProvider)
    assert provider.name == "openai"
    assert provider.is_available is True


@pytest.mark.parametrize(
    ("model", "api_key", "missing"),
    [
        (None, SecretStr(API_KEY), "AI_MODEL"),
        (MODEL, None, "AI_PROVIDER_API_KEY"),
    ],
)
def test_the_factory_requires_a_model_and_a_credential(
    model: str | None, api_key: SecretStr | None, missing: str
) -> None:
    with pytest.raises(ModelProviderSetupError, match=f"{missing} is required") as raised:
        build_openai_provider(
            ModelProviderConfig(model=model, api_key=api_key, timeout_seconds=5.0)
        )

    assert API_KEY not in str(raised.value)
