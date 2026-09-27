import logging

import pytest
from fastapi.testclient import TestClient
from httpx2 import Response

from app.config.settings import Settings
from app.interpretation.intent_interpreter import IntentInterpreter
from app.prompts.intent import INTENT_PROMPT_VERSION
from app.providers.disabled import DisabledModelProvider
from app.providers.model_provider import ModelRateLimitedError, ModelTimeoutError
from tests.conftest import AUTH_HEADERS, ClientFactory
from tests.fakes import HangingModelProvider, ScriptedModelProvider, interpreted_output

INTERPRET_PATH = "/v1/intent/interpret"
PROMPT = "Indie rock, around 30 tracks. Use Radiohead and Interpol. Avoid Coldplay."


def post_prompt(
    client: TestClient,
    body: dict[str, object] | None = None,
    headers: dict[str, str] = AUTH_HEADERS,
) -> Response:
    return client.post(INTERPRET_PATH, json=body or {"prompt": PROMPT}, headers=headers)


def test_returns_the_validated_intent_with_the_prompt_version(make_client: ClientFactory) -> None:
    provider = ScriptedModelProvider([interpreted_output()])

    response = post_prompt(make_client(provider))

    assert response.status_code == 200
    assert response.json() == {
        "promptVersion": INTENT_PROMPT_VERSION,
        "result": interpreted_output(),
    }


def test_sends_only_the_user_prompt_and_versioned_instructions_to_the_model(
    make_client: ClientFactory,
) -> None:
    provider = ScriptedModelProvider([interpreted_output()])

    post_prompt(make_client(provider))

    [model_request] = provider.requests
    assert model_request.user_prompt == PROMPT
    assert model_request.prompt_version == INTENT_PROMPT_VERSION


def test_returns_a_clarification_result(make_client: ClientFactory) -> None:
    clarification = {
        "outcome": "needs_clarification",
        "clarification": {
            "reason": "unsupported_constraint",
            "unsupportedConstraints": [
                {
                    "category": "energy",
                    "userText": "more energetic over time",
                }
            ],
        },
    }

    response = post_prompt(make_client(ScriptedModelProvider([clarification])))

    assert response.status_code == 200
    assert response.json()["result"] == clarification


def test_retries_once_when_the_model_output_is_invalid(make_client: ClientFactory) -> None:
    provider = ScriptedModelProvider([{"outcome": "interpreted"}, interpreted_output()])

    response = post_prompt(make_client(provider))

    assert response.status_code == 200
    assert len(provider.requests) == 2


def test_stops_after_bounded_invalid_model_outputs(make_client: ClientFactory) -> None:
    invalid = interpreted_output(artistIds=["4Z8W4fKeB5YxbusRsdQVPb"])
    provider = ScriptedModelProvider([invalid, invalid, interpreted_output()])

    response = post_prompt(make_client(provider))

    assert response.status_code == 502
    assert response.json()["code"] == "INVALID_MODEL_OUTPUT"
    assert len(provider.requests) == 2


def test_returns_a_mood_only_intent_with_a_target_duration_and_an_activity(
    make_client: ClientFactory,
) -> None:
    output = interpreted_output(
        kind="genre_mix",
        artists=[],
        targetTrackCount=None,
        targetDurationMinutes=60,
        mood="happy",
        popularity=None,
        excludeArtists=[],
        unsupportedConstraints=[{"category": "activity", "userText": "to dance at a party"}],
    )

    response = post_prompt(make_client(ScriptedModelProvider([output])))

    assert response.status_code == 200
    assert response.json()["result"] == output


@pytest.mark.parametrize(
    "invalid_fields",
    [
        {"mood": "party"},
        {"mood": "groovy"},
        {"targetDurationMinutes": -30},
        {"targetDurationMinutes": 90.5},
        {"targetDurationMinutes": "60"},
    ],
)
def test_retries_a_duration_or_mood_outside_the_wire_contract(
    make_client: ClientFactory, invalid_fields: dict[str, object]
) -> None:
    provider = ScriptedModelProvider([interpreted_output(**invalid_fields), interpreted_output()])

    response = post_prompt(make_client(provider))

    assert response.status_code == 200
    assert response.json()["result"] == interpreted_output()
    assert len(provider.requests) == 2


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (ModelTimeoutError(), 504, "MODEL_TIMEOUT"),
        (ModelRateLimitedError(), 429, "MODEL_RATE_LIMITED"),
    ],
)
def test_normalizes_model_provider_errors(
    make_client: ClientFactory, error: Exception, status: int, code: str
) -> None:
    response = post_prompt(make_client(ScriptedModelProvider([error])))

    assert response.status_code == status
    assert response.json()["code"] == code


def test_reports_unavailable_without_a_configured_model(make_client: ClientFactory) -> None:
    response = post_prompt(make_client(DisabledModelProvider()))

    assert response.status_code == 503
    assert response.json() == {
        "code": "MODEL_UNAVAILABLE",
        "message": "Intent interpretation is not available.",
    }


def test_times_out_a_model_call_that_hangs(make_client: ClientFactory) -> None:
    client = make_client()
    client.app.state.intent_interpreter = IntentInterpreter(
        HangingModelProvider(), model_call_timeout_seconds=0.01
    )

    response = post_prompt(client)

    assert response.status_code == 504
    assert response.json()["code"] == "MODEL_TIMEOUT"


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Bearer wrong-token"},
        {"Authorization": AUTH_HEADERS["Authorization"].replace("Bearer ", "Basic ")},
    ],
)
def test_rejects_requests_without_the_internal_token(
    make_client: ClientFactory, headers: dict[str, str]
) -> None:
    provider = ScriptedModelProvider([interpreted_output()])

    response = post_prompt(make_client(provider), headers=headers)

    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"
    assert provider.requests == []


def test_fails_closed_when_no_service_token_is_configured(make_client: ClientFactory) -> None:
    provider = ScriptedModelProvider([interpreted_output()])
    tokenless = Settings(environment="development", service_token=None, model_provider="disabled")

    response = post_prompt(make_client(provider, tokenless))

    assert response.status_code == 401
    assert provider.requests == []


@pytest.mark.parametrize(
    "body",
    [
        {"prompt": "   "},
        {"prompt": "x" * 2_001},
        {"prompt": PROMPT, "spotifyTrackIds": ["4uLU6hMCjMI75M1A2tKUQC"]},
        {"prompt": PROMPT, "playlist": {"tracks": [{"uri": "spotify:track:1"}]}},
        {"text": PROMPT},
    ],
)
def test_rejects_requests_outside_the_contract(
    make_client: ClientFactory, body: dict[str, object]
) -> None:
    provider = ScriptedModelProvider([interpreted_output()])

    response = post_prompt(make_client(provider), body=body)

    assert response.status_code == 422
    assert response.json() == {
        "code": "INVALID_REQUEST",
        "message": "The request does not match the AI service contract.",
    }
    assert provider.requests == []


def test_unknown_routes_use_the_error_envelope(make_client: ClientFactory) -> None:
    response = make_client().get("/v1/unknown", headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


def test_never_logs_the_user_prompt(
    make_client: ClientFactory, caplog: pytest.LogCaptureFixture
) -> None:
    provider = ScriptedModelProvider([{"outcome": "interpreted"}, interpreted_output()])

    with caplog.at_level(logging.DEBUG):
        post_prompt(make_client(provider))

    assert caplog.records
    assert all(PROMPT not in record.getMessage() for record in caplog.records)
