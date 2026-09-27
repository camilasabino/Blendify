import re
from typing import Any

import pytest

from app.models.intent import (
    ClarificationReason,
    Mood,
    PlaylistKind,
    UnsupportedConstraintCategory,
    intent_interpretation_adapter,
)
from app.models.interpretation import AI_INTENT_PROMPT_MAX_LENGTH
from evals.intent_eval import (
    DATASET_PATH,
    EXPECTATION_KEYS,
    EvalCase,
    check_case,
    load_dataset,
)
from tests.fakes import interpreted_output

HISTORICAL_V1_DATASET_PATH = DATASET_PATH.parent / "intent-eval-v1.json"
HISTORICAL_V1_CASE_COUNT = 27
DATASET_VERSION, CASES = load_dataset()
ALL_DATASET_CASES = [
    case for path in (HISTORICAL_V1_DATASET_PATH, DATASET_PATH) for case in load_dataset(path)[1]
]
KINDS = set(PlaylistKind.__args__)
MOODS = set(Mood.__args__)
CATEGORIES = set(UnsupportedConstraintCategory.__args__)
REASONS = set(ClarificationReason.__args__)
PROVIDER_CONTENT_PATTERN = re.compile(r"spotify:|open\.spotify|https?://|\b[0-9A-Za-z]{22}\b")


def test_dataset_is_versioned_with_unique_case_ids() -> None:
    ids = [case.id for case in CASES]

    assert DATASET_VERSION == "intent-eval-v2"
    assert len(ids) == len(set(ids))


def test_historical_v1_dataset_is_preserved_for_baseline_comparison() -> None:
    version, cases = load_dataset(HISTORICAL_V1_DATASET_PATH)

    assert version == "intent-eval-v1"
    assert len(cases) == HISTORICAL_V1_CASE_COUNT
    assert DATASET_PATH != HISTORICAL_V1_DATASET_PATH


def test_dataset_covers_every_mood_in_each_supported_language() -> None:
    moods = {case.expect["mood"] for case in CASES if case.expect.get("mood")}
    mood_languages = {case.language for case in CASES if case.expect.get("mood")}

    assert moods == MOODS
    assert mood_languages == {"en", "es", "pt"}


def test_dataset_covers_duration_in_each_supported_language() -> None:
    durations = [case for case in CASES if case.expect.get("targetDurationMinutes") is not None]

    assert {case.language for case in durations} == {"en", "es", "pt"}
    assert 0 in {case.expect["targetDurationMinutes"] for case in durations}
    assert any(case.expect.get("targetTrackCount") for case in durations)


def test_dataset_keeps_activity_out_of_the_mood_vocabulary() -> None:
    party = next(case for case in CASES if case.id == "en-mood-activity-party")

    assert party.prompt == "Happy music to dance at a party"
    assert party.expect["outcome"] == "interpreted"
    assert party.expect["mood"] == "happy"
    assert party.expect["unsupportedCategoriesWithin"] == ["activity"]


def test_dataset_covers_every_kind_language_and_outcome() -> None:
    kinds = {case.expect.get("kind") for case in CASES}
    languages = {case.language for case in CASES}
    reasons = {case.expect.get("clarificationReason") for case in CASES}

    assert kinds >= KINDS
    assert languages == {"en", "es", "pt"}
    assert reasons >= REASONS


@pytest.mark.parametrize("case", ALL_DATASET_CASES, ids=lambda case: case.id)
def test_every_case_is_well_formed_user_authored_text(case: EvalCase) -> None:
    assert set(case.expect) <= EXPECTATION_KEYS
    assert case.expect["outcome"] in {"interpreted", "needs_clarification"}
    assert 0 < len(case.prompt) <= AI_INTENT_PROMPT_MAX_LENGTH
    assert not PROVIDER_CONTENT_PATTERN.search(case.prompt)
    assert case.expect.get("kind", "artist_mix") in KINDS
    assert case.expect.get("clarificationReason", "ambiguous_request") in REASONS
    assert case.expect.get("mood") in MOODS | {None}
    for key in ("unsupportedCategories", "unsupportedCategoriesWithin"):
        assert set(case.expect.get(key, [])) <= CATEGORIES


def interpretation(**intent_overrides: Any):
    return intent_interpretation_adapter.validate_python(interpreted_output(**intent_overrides))


def test_check_passes_when_every_stated_property_matches() -> None:
    expect = {
        "outcome": "interpreted",
        "kind": "artist_mix",
        "artists": ["radiohead", "INTERPOL"],
        "targetTrackCount": 30,
        "popularity": "rarities",
        "excludeArtists": ["Coldplay"],
        "unsupportedCategories": [],
    }

    assert check_case(expect, interpretation()) == []


def test_check_reports_each_semantic_mismatch() -> None:
    expect = {
        "outcome": "interpreted",
        "artists": ["Radiohead"],
        "popularity": "popular",
        "unsupportedCategoriesWithin": ["energy"],
    }

    failures = check_case(expect, interpretation())

    assert [failure.split(":")[0] for failure in failures] == [
        "artists",
        "popularity",
        "unsupportedCategoriesWithin",
    ]


def test_check_compares_duration_and_mood() -> None:
    result = interpretation(
        kind="genre_mix",
        artists=[],
        targetTrackCount=None,
        targetDurationMinutes=60,
        mood="happy",
    )

    assert check_case({"outcome": "interpreted", "targetDurationMinutes": 60}, result) == []
    assert check_case({"outcome": "interpreted", "mood": "happy"}, result) == []
    assert check_case({"outcome": "interpreted", "mood": None}, result) == [
        "mood: expected None, got happy"
    ]
    assert check_case({"outcome": "interpreted", "targetDurationMinutes": 90}, result) == [
        "targetDurationMinutes: expected 90, got 60"
    ]


def test_check_compares_track_titles_and_artists() -> None:
    result = interpretation(
        kind="discover_track",
        artists=[],
        seedTracks=[{"title": "Teardrop", "artist": None}],
    )

    assert check_case({"outcome": "interpreted", "seedTrackTitles": ["teardrop"]}, result) == []
    assert check_case({"outcome": "interpreted", "seedTrackArtists": [None]}, result) == []
    assert check_case({"outcome": "interpreted", "seedTrackArtists": ["Massive Attack"]}, result)


def test_check_stops_at_an_outcome_mismatch() -> None:
    clarification = intent_interpretation_adapter.validate_python(
        {
            "outcome": "needs_clarification",
            "clarification": {"reason": "ambiguous_request", "unsupportedConstraints": []},
        }
    )

    assert check_case({"outcome": "interpreted", "kind": "genre_mix"}, clarification) == [
        "outcome: expected interpreted, got needs_clarification"
    ]
    assert check_case(
        {"outcome": "needs_clarification", "clarificationReason": "not_a_playlist_request"},
        clarification,
    ) == ["clarificationReason: expected not_a_playlist_request, got ambiguous_request"]
