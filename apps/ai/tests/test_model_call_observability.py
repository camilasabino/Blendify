import json
import logging
from collections.abc import Mapping

import pytest
from fastapi.testclient import TestClient

from app.interpretation.intent_interpreter import IntentInterpreter
from app.prompts.intent import INTENT_PROMPT_VERSION
from app.prompts.refinement import REFINEMENT_PROMPT_VERSION
from app.providers.model_provider import (
    ModelConfigurationError,
    ModelIntentRequest,
    ModelIntentResult,
    ModelInvalidOutputError,
    ModelTokenUsage,
)
from tests.conftest import AUTH_HEADERS, ClientFactory
from tests.fakes import (
    FAKE_MODEL,
    FAKE_PROVIDER,
    HangingModelProvider,
    ScriptedModelProvider,
    current_intent,
    empty_preservation,
    interpreted_output,
    refinement_output,
)

PROMPT_SENTINEL = "SECRET_USER_PROMPT_SENTINEL"
REFINEMENT_SENTINEL = "SECRET_REFINEMENT_SENTINEL"
INTENT_ARTIST_SENTINEL = "USER_AUTHORED_ARTIST_SENTINEL"
MODEL_OUTPUT_SENTINEL = "RAW_MODEL_OUTPUT_SENTINEL"
REQUEST_ID = "3f1c2a9e-7b4d-4e8a-9c1f-2d6b5e8a7c30"
EVENT_LOGGER = "app.observability.model_call_log"
SENTINELS = (PROMPT_SENTINEL, REFINEMENT_SENTINEL, INTENT_ARTIST_SENTINEL, MODEL_OUTPUT_SENTINEL)
INVALID_USAGE = ModelTokenUsage(input_tokens=90, output_tokens=7, total_tokens=97)


class UsageFreeModelProvider(ScriptedModelProvider):
    async def generate_intent(self, request: ModelIntentRequest) -> ModelIntentResult:
        result = await super().generate_intent(request)
        return ModelIntentResult(payload=result.payload, model=result.model, usage=None)


def interpret(client: TestClient, headers: Mapping[str, str] | None = None) -> int:
    response = client.post(
        "/v1/intent/interpret",
        json={"prompt": f"{PROMPT_SENTINEL} with Radiohead"},
        headers={**AUTH_HEADERS, **(headers or {})},
    )
    return response.status_code


def model_events(caplog: pytest.LogCaptureFixture) -> list[dict[str, object]]:
    return [
        json.loads(record.getMessage()) for record in caplog.records if record.name == EVENT_LOGGER
    ]


def assert_no_sentinel(caplog: pytest.LogCaptureFixture) -> None:
    logged = "\n".join(record.getMessage() for record in caplog.records)
    for sentinel in SENTINELS:
        assert sentinel not in logged


def test_successful_call_records_safe_metadata_with_usage_and_correlation(
    make_client: ClientFactory, caplog: pytest.LogCaptureFixture
) -> None:
    provider = ScriptedModelProvider([interpreted_output(artists=[INTENT_ARTIST_SENTINEL])])

    with caplog.at_level(logging.INFO):
        status = interpret(make_client(provider), {"X-Request-Id": REQUEST_ID})

    request_event, call_event = model_events(caplog)
    assert status == 200
    assert request_event == {
        "event": "ai.model_request",
        "requestId": REQUEST_ID,
        "operation": "intent_interpretation",
        "provider": FAKE_PROVIDER,
        "model": FAKE_MODEL,
        "promptVersion": INTENT_PROMPT_VERSION,
        "attempt": 1,
        "result": "ok",
        "durationMs": request_event["durationMs"],
        "inputTokens": 120,
        "outputTokens": 40,
        "totalTokens": 160,
        "validationErrorCount": None,
        "configurationReason": None,
    }
    assert call_event == {
        "event": "ai.model_call",
        "requestId": REQUEST_ID,
        "operation": "intent_interpretation",
        "provider": FAKE_PROVIDER,
        "model": FAKE_MODEL,
        "promptVersion": INTENT_PROMPT_VERSION,
        "result": "completed",
        "outcome": "interpreted",
        "errorCode": None,
        "modelRequests": 1,
        "durationMs": call_event["durationMs"],
        "inputTokens": 120,
        "outputTokens": 40,
        "totalTokens": 160,
        "usageComplete": True,
    }
    assert isinstance(call_event["durationMs"], int)
    assert_no_sentinel(caplog)


def test_structured_output_retry_counts_each_model_request_once(
    make_client: ClientFactory, caplog: pytest.LogCaptureFixture
) -> None:
    provider = ScriptedModelProvider(
        [
            ModelInvalidOutputError(
                f"not JSON: {MODEL_OUTPUT_SENTINEL}", model=FAKE_MODEL, usage=INVALID_USAGE
            ),
            {"outcome": "interpreted", "intent": {"artists": [MODEL_OUTPUT_SENTINEL]}},
            interpreted_output(),
        ]
    )

    with caplog.at_level(logging.INFO):
        status = interpret(make_client(provider))

    events = model_events(caplog)
    assert status == 502
    assert [(event["event"], event["result"]) for event in events] == [
        ("ai.model_request", "invalid_output"),
        ("ai.model_request", "invalid_output"),
        ("ai.model_call", "failed"),
    ]
    assert events[0]["inputTokens"] == 90
    assert events[1]["validationErrorCount"] is not None
    assert events[2]["modelRequests"] == 2
    assert events[2]["errorCode"] == "INVALID_MODEL_OUTPUT"
    assert events[2]["totalTokens"] == 97 + 160
    assert_no_sentinel(caplog)


def test_missing_usage_stays_unknown_instead_of_estimated(
    make_client: ClientFactory, caplog: pytest.LogCaptureFixture
) -> None:
    provider = UsageFreeModelProvider([interpreted_output()])

    with caplog.at_level(logging.INFO):
        interpret(make_client(provider))

    call_event = model_events(caplog)[-1]
    assert call_event["inputTokens"] is None
    assert call_event["outputTokens"] is None
    assert call_event["totalTokens"] is None
    assert call_event["usageComplete"] is False


def test_timeout_records_the_request_without_usage(
    make_client: ClientFactory, caplog: pytest.LogCaptureFixture
) -> None:
    client = make_client()
    client.app.state.intent_interpreter = IntentInterpreter(
        HangingModelProvider(), model_call_timeout_seconds=0.01
    )

    with caplog.at_level(logging.INFO):
        status = interpret(client)

    request_event, call_event = model_events(caplog)
    assert status == 504
    assert request_event["result"] == "timeout"
    assert request_event["totalTokens"] is None
    assert call_event["errorCode"] == "MODEL_TIMEOUT"
    assert call_event["modelRequests"] == 1
    assert call_event["usageComplete"] is False


def test_provider_configuration_failure_logs_only_a_bounded_reason(
    make_client: ClientFactory, caplog: pytest.LogCaptureFixture
) -> None:
    provider = ScriptedModelProvider([ModelConfigurationError("authentication")])

    with caplog.at_level(logging.INFO):
        status = interpret(make_client(provider))

    request_event, call_event = model_events(caplog)
    assert status == 503
    assert request_event["result"] == "misconfigured"
    assert request_event["configurationReason"] == "authentication"
    assert call_event["errorCode"] == "MODEL_UNAVAILABLE"
    assert_no_sentinel(caplog)


def test_refinement_logs_metadata_without_refinement_or_ai_safe_state(
    make_client: ClientFactory, caplog: pytest.LogCaptureFixture
) -> None:
    provider = ScriptedModelProvider([refinement_output()])

    with caplog.at_level(logging.DEBUG):
        response = make_client(provider).post(
            "/v1/refinement/plan",
            json={
                "intent": current_intent(artists=[INTENT_ARTIST_SENTINEL]),
                "preservation": empty_preservation(),
                "refinement": REFINEMENT_SENTINEL,
            },
            headers={**AUTH_HEADERS, "X-Request-Id": REQUEST_ID},
        )

    call_event = model_events(caplog)[-1]
    assert response.status_code == 200
    assert call_event["operation"] == "refinement_interpretation"
    assert call_event["promptVersion"] == REFINEMENT_PROMPT_VERSION
    assert call_event["requestId"] == REQUEST_ID
    assert_no_sentinel(caplog)


@pytest.mark.parametrize(
    "request_id", [PROMPT_SENTINEL, "../../etc", f"{REQUEST_ID}\n{PROMPT_SENTINEL}", ""]
)
def test_ignores_request_ids_that_are_not_opaque_uuids(
    make_client: ClientFactory, caplog: pytest.LogCaptureFixture, request_id: str
) -> None:
    provider = ScriptedModelProvider([interpreted_output()])

    with caplog.at_level(logging.INFO):
        interpret(make_client(provider), {"X-Request-Id": request_id})

    assert {event["requestId"] for event in model_events(caplog)} == {None}
    assert_no_sentinel(caplog)


def test_a_failing_log_handler_never_fails_the_interpretation(
    make_client: ClientFactory,
) -> None:
    class ExplodingHandler(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            raise RuntimeError("log sink down")

    handler = ExplodingHandler()
    event_logger = logging.getLogger(EVENT_LOGGER)
    event_logger.addHandler(handler)
    try:
        status = interpret(make_client(ScriptedModelProvider([interpreted_output()])))
    finally:
        event_logger.removeHandler(handler)

    assert status == 200
