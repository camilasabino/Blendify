import hashlib

from app.models.intent import Mood
from app.prompts.intent import (
    INTENT_PROMPT_VERSION,
    INTENT_SYSTEM_PROMPT,
    build_intent_model_request,
)
from app.prompts.intent_v1 import INTENT_V1_PROMPT_VERSION, INTENT_V1_SYSTEM_PROMPT
from app.prompts.intent_v2 import INTENT_V2_PROMPT_VERSION, INTENT_V2_SYSTEM_PROMPT

INTENT_V1_BASELINE_SHA256 = "6f765db08aaf50eee3d7934fccbf8ebcbc132a18ee53d9acd1fd78b3dc4fbcb5"
INTENT_V2_BASELINE_SHA256 = "274418d1f63e9f9ef65fe99f62af3027dffeece6783f933afe86c786ad3e64c2"


def test_current_prompt_is_intent_v3() -> None:
    request = build_intent_model_request("Pop music for an hour")

    assert INTENT_PROMPT_VERSION == "intent-v3"
    assert request.prompt_version == INTENT_PROMPT_VERSION
    assert request.system_prompt == INTENT_SYSTEM_PROMPT
    assert request.user_prompt == "Pop music for an hour"


def test_intent_v1_stays_frozen_for_the_historical_baseline() -> None:
    digest = hashlib.sha256(INTENT_V1_SYSTEM_PROMPT.encode()).hexdigest()

    assert INTENT_V1_PROMPT_VERSION == "intent-v1"
    assert digest == INTENT_V1_BASELINE_SHA256
    assert INTENT_V1_SYSTEM_PROMPT != INTENT_SYSTEM_PROMPT


def test_intent_v2_stays_frozen_for_the_historical_baseline() -> None:
    digest = hashlib.sha256(INTENT_V2_SYSTEM_PROMPT.encode()).hexdigest()

    assert INTENT_V2_PROMPT_VERSION == "intent-v2"
    assert digest == INTENT_V2_BASELINE_SHA256
    assert INTENT_V2_SYSTEM_PROMPT != INTENT_SYSTEM_PROMPT


def test_current_prompt_teaches_every_mood_of_the_closed_vocabulary() -> None:
    for mood in Mood.__args__:
        assert f'"{mood}"' in INTENT_SYSTEM_PROMPT


def test_current_prompt_teaches_duration_in_whole_minutes() -> None:
    assert "targetDurationMinutes" in INTENT_SYSTEM_PROMPT
    assert '"an hour" = 60' in INTENT_SYSTEM_PROMPT
    assert '"hour and a half" = 90' in INTENT_SYSTEM_PROMPT


def test_current_prompt_keeps_activities_out_of_the_mood_vocabulary() -> None:
    assert "is never a mood" in INTENT_SYSTEM_PROMPT
    for activity in ("party", "workout", "running", "focus", "sleep"):
        assert f'"{activity}"' not in INTENT_SYSTEM_PROMPT


def test_current_prompt_never_infers_an_era_from_a_nostalgic_mood() -> None:
    assert "it never implies a decade" in INTENT_SYSTEM_PROMPT


def test_mood_vocabulary_excludes_activities_and_musical_characteristics() -> None:
    non_moods = {"focus", "workout", "running", "party", "studying", "sleep", "chill"}
    non_moods |= {"groovy", "acoustic", "heavy", "danceable", "melodic"}

    assert non_moods.isdisjoint(Mood.__args__)


def test_current_prompt_never_reports_a_supported_duration_as_unsupported() -> None:
    assert "never report it as an unsupported duration" in INTENT_SYSTEM_PROMPT
    assert "never invent minutes" in INTENT_SYSTEM_PROMPT
    assert '"a long run"' in INTENT_SYSTEM_PROMPT


def test_current_prompt_reports_musical_characteristics_as_other() -> None:
    assert "report it under unsupportedConstraints as other" in INTENT_SYSTEM_PROMPT


def test_current_prompt_never_duplicates_a_canonicalized_mood() -> None:
    assert "never reported again under unsupportedConstraints" in INTENT_SYSTEM_PROMPT
