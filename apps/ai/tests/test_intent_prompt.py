import hashlib

from app.models.intent import Mood
from app.prompts.intent import (
    INTENT_PROMPT_VERSION,
    INTENT_SYSTEM_PROMPT,
    build_intent_model_request,
)
from app.prompts.intent_v1 import INTENT_V1_PROMPT_VERSION, INTENT_V1_SYSTEM_PROMPT

INTENT_V1_BASELINE_SHA256 = "6f765db08aaf50eee3d7934fccbf8ebcbc132a18ee53d9acd1fd78b3dc4fbcb5"


def test_current_prompt_is_intent_v2() -> None:
    request = build_intent_model_request("Pop music for an hour")

    assert INTENT_PROMPT_VERSION == "intent-v2"
    assert request.prompt_version == INTENT_PROMPT_VERSION
    assert request.system_prompt == INTENT_SYSTEM_PROMPT
    assert request.user_prompt == "Pop music for an hour"


def test_intent_v1_stays_frozen_for_the_historical_baseline() -> None:
    digest = hashlib.sha256(INTENT_V1_SYSTEM_PROMPT.encode()).hexdigest()

    assert INTENT_V1_PROMPT_VERSION == "intent-v1"
    assert digest == INTENT_V1_BASELINE_SHA256
    assert INTENT_V1_SYSTEM_PROMPT != INTENT_SYSTEM_PROMPT


def test_intent_v2_teaches_every_mood_of_the_closed_vocabulary() -> None:
    for mood in Mood.__args__:
        assert f'"{mood}"' in INTENT_SYSTEM_PROMPT


def test_intent_v2_teaches_duration_in_whole_minutes() -> None:
    assert "targetDurationMinutes" in INTENT_SYSTEM_PROMPT
    assert '"an hour" = 60' in INTENT_SYSTEM_PROMPT
    assert '"hour and a half" = 90' in INTENT_SYSTEM_PROMPT


def test_intent_v2_keeps_activities_out_of_the_mood_vocabulary() -> None:
    assert "is never a mood" in INTENT_SYSTEM_PROMPT
    for activity in ("party", "workout", "running", "focus", "sleep"):
        assert f'"{activity}"' not in INTENT_SYSTEM_PROMPT
