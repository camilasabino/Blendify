import hashlib
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
HISTORICAL_V1_DATASET_SHA256 = "31b87c590fb4c44d6347019132eb22eae1b0e63cd18cec52bec322051289e23c"
HISTORICAL_V2_DATASET_PATH = DATASET_PATH.parent / "intent-eval-v2.json"
HISTORICAL_V2_CASE_COUNT = 63
HISTORICAL_V2_DATASET_SHA256 = "e48d430825cf60d4cf1142f5c9e32206b2415269ce9df5189b2682e411201d68"
HISTORICAL_V3_DATASET_PATH = DATASET_PATH.parent / "intent-eval-v3.json"
HISTORICAL_V3_DATASET_SHA256 = "6ef41274bf59d7be2d750c48a9cb2242037899e4e68f8af1c9d1881029e583dc"
HISTORICAL_V4_DATASET_PATH = DATASET_PATH.parent / "intent-eval-v4.json"
HISTORICAL_V4_DATASET_SHA256 = "e8be2837489f0dca04912cb2cf336e37fa3f5fe9e72d4dd98083e534e4456312"
HISTORICAL_V5_DATASET_PATH = DATASET_PATH.parent / "intent-eval-v5.json"
HISTORICAL_V5_DATASET_SHA256 = "5184cdaecefc5976198ee1f82eeabf824ce3bbd2e4208b3dfdb9a7ce1fed89cf"
RELEASE_RANGE_SUPERSEDED_EXPECTATIONS: dict[str, dict[str, Any]] = {
    "es-era-random-order": {
        "outcome": "interpreted",
        "kind": "genre_mix",
        "genres": ["rock nacional"],
        "orderMode": "random",
        "releaseRange": {"fromYear": 1980, "toYear": 1989},
        "unsupportedCategories": [],
    },
    "en-mood-nostalgic-era": {
        "outcome": "interpreted",
        "kind": "genre_mix",
        "artists": [],
        "genres": [],
        "mood": "nostalgic",
        "releaseRange": {"fromYear": 1990, "toYear": 1999},
        "unsupportedCategories": [],
    },
}
DATASET_VERSION, CASES = load_dataset()
ALL_DATASET_CASES = [
    case
    for path in (
        HISTORICAL_V1_DATASET_PATH,
        HISTORICAL_V2_DATASET_PATH,
        HISTORICAL_V3_DATASET_PATH,
        HISTORICAL_V4_DATASET_PATH,
        HISTORICAL_V5_DATASET_PATH,
        DATASET_PATH,
    )
    for case in load_dataset(path)[1]
]
KINDS = set(PlaylistKind.__args__)
MOODS = set(Mood.__args__)
CATEGORIES = set(UnsupportedConstraintCategory.__args__)
REASONS = set(ClarificationReason.__args__)
PROVIDER_CONTENT_PATTERN = re.compile(r"spotify:|open\.spotify|https?://|\b[0-9A-Za-z]{22}\b")


def test_dataset_is_versioned_with_unique_case_ids() -> None:
    ids = [case.id for case in CASES]

    assert DATASET_VERSION == "intent-eval-v6"
    assert len(ids) == len(set(ids))


def test_historical_v1_dataset_is_preserved_for_baseline_comparison() -> None:
    digest = hashlib.sha256(HISTORICAL_V1_DATASET_PATH.read_bytes()).hexdigest()
    version, cases = load_dataset(HISTORICAL_V1_DATASET_PATH)

    assert digest == HISTORICAL_V1_DATASET_SHA256
    assert version == "intent-eval-v1"
    assert len(cases) == HISTORICAL_V1_CASE_COUNT
    assert DATASET_PATH != HISTORICAL_V1_DATASET_PATH


def test_historical_v2_dataset_is_preserved_for_baseline_comparison() -> None:
    digest = hashlib.sha256(HISTORICAL_V2_DATASET_PATH.read_bytes()).hexdigest()
    version, cases = load_dataset(HISTORICAL_V2_DATASET_PATH)

    assert digest == HISTORICAL_V2_DATASET_SHA256
    assert version == "intent-eval-v2"
    assert DATASET_PATH != HISTORICAL_V2_DATASET_PATH
    assert len(cases) == HISTORICAL_V2_CASE_COUNT


def test_historical_v5_dataset_stays_frozen_and_inside_v6() -> None:
    digest = hashlib.sha256(HISTORICAL_V5_DATASET_PATH.read_bytes()).hexdigest()
    version, cases = load_dataset(HISTORICAL_V5_DATASET_PATH)

    assert digest == HISTORICAL_V5_DATASET_SHA256
    assert version == "intent-eval-v5"
    for case in cases:
        assert_carried_over(case)


def test_historical_v4_dataset_stays_frozen_and_inside_v5() -> None:
    digest = hashlib.sha256(HISTORICAL_V4_DATASET_PATH.read_bytes()).hexdigest()
    version, cases = load_dataset(HISTORICAL_V4_DATASET_PATH)

    assert digest == HISTORICAL_V4_DATASET_SHA256
    assert version == "intent-eval-v4"
    for case in cases:
        assert_carried_over(case)


def assert_carried_over(case: EvalCase) -> None:
    current = {item.id: item for item in CASES}[case.id]
    superseded = RELEASE_RANGE_SUPERSEDED_EXPECTATIONS.get(case.id)
    if superseded is None:
        assert current == case
        return
    assert "era" in case.expect["unsupportedCategories"]
    assert (current.language, current.prompt) == (case.language, case.prompt)
    assert current.expect == superseded


FILTER_COVERAGE = {
    "femaleVocals": {
        "es": ["es-female-vocals-genre", "es-female-vocals-singular", "es-female-singers"],
        "en": ["en-female-vocals-genre", "en-female-singers-discover"],
        "pt": ["pt-female-vocals-genre", "pt-female-singers"],
    },
    "releaseRange": {
        "es": ["es-decade", "es-year-range", "es-before-year", "es-until-year", "es-since-year"],
        "en": ["en-decade", "en-after-year", "en-before-year"],
        "pt": ["pt-decade", "pt-since-year"],
    },
    "excludeLive": {
        "es": ["es-exclude-live", "es-exclude-live-recordings"],
        "en": ["en-exclude-live", "en-exclude-live-recordings"],
        "pt": ["pt-exclude-live", "pt-exclude-live-recordings"],
    },
}


@pytest.mark.parametrize("filter_name", sorted(FILTER_COVERAGE))
@pytest.mark.parametrize("language", ["es", "en", "pt"])
def test_dataset_covers_each_new_filter_in_each_language(filter_name: str, language: str) -> None:
    by_id = {case.id: case for case in CASES}

    for case_id in FILTER_COVERAGE[filter_name][language]:
        case = by_id[case_id]
        assert case.language == language
        assert case.expect[filter_name] not in (None, False)


@pytest.mark.parametrize(
    "case_id",
    [
        "es-only-women-not-vocals",
        "en-only-women-not-vocals",
        "pt-only-women-not-vocals",
    ],
)
def test_demographic_wording_never_counts_as_female_vocals(case_id: str) -> None:
    case = {item.id: item for item in CASES}[case_id]

    assert case.expect["femaleVocals"] is False
    assert case.expect["unsupportedCategories"] == ["artist_attribute"]


@pytest.mark.parametrize(
    "case_id",
    [
        "es-studio-only",
        "en-studio-recordings",
        "en-studio-versions-only",
        "pt-studio-only",
    ],
)
def test_studio_only_wording_never_sets_exclude_live(case_id: str) -> None:
    case = {item.id: item for item in CASES}[case_id]

    assert case.expect["excludeLive"] is False
    assert case.expect["unsupportedCategories"] == ["other"]


@pytest.mark.parametrize(
    "case_id",
    ["es-style-era-not-range", "en-style-era-not-range", "pt-style-era-not-range"],
)
def test_stylistic_era_wording_never_sets_a_release_range(case_id: str) -> None:
    case = {item.id: item for item in CASES}[case_id]

    assert case.expect["releaseRange"] is None
    assert case.expect["unsupportedCategories"] == ["era"]


def test_release_range_boundaries_follow_the_stated_words() -> None:
    by_id = {
        case.id: case.expect["releaseRange"] for case in CASES if "releaseRange" in case.expect
    }

    assert by_id["es-before-year"] == {"fromYear": None, "toYear": 1999}
    assert by_id["es-until-year"] == {"fromYear": None, "toYear": 1999}
    assert by_id["es-since-year"] == {"fromYear": 2015, "toYear": None}
    assert by_id["en-after-year"] == {"fromYear": 2016, "toYear": None}
    assert by_id["es-year-range"] == {"fromYear": 1990, "toYear": 1995}


def test_filter_expectations_compare_the_canonical_wire_filters() -> None:
    filtered = interpretation(
        kind="genre_mix",
        artists=[],
        genres=["rock"],
        filters={
            "region": None,
            "femaleVocals": True,
            "releaseRange": {"fromYear": 1990, "toYear": None},
            "excludeLive": True,
        },
    )

    assert (
        check_case(
            {
                "outcome": "interpreted",
                "femaleVocals": True,
                "releaseRange": {"fromYear": 1990, "toYear": None},
                "excludeLive": True,
            },
            filtered,
        )
        == []
    )
    assert check_case({"outcome": "interpreted", "releaseRange": None}, filtered) == [
        "releaseRange: expected None, got {'fromYear': 1990, 'toYear': None}"
    ]
    assert check_case({"outcome": "interpreted", "femaleVocals": False}, filtered) == [
        "femaleVocals: expected False, got True"
    ]


REGION_COVERAGE = {
    "es": ["es-region-discover-artist", "es-region-discover-track", "es-region-artist-mix"],
    "en": ["en-region-discover-artist", "en-region-discover-track"],
    "pt": ["pt-region-discover-artist", "pt-region-discover-track"],
}


@pytest.mark.parametrize("language", sorted(REGION_COVERAGE))
def test_dataset_covers_region_filters_in_each_language(language: str) -> None:
    by_id = {case.id: case for case in CASES}

    for case_id in REGION_COVERAGE[language]:
        case = by_id[case_id]
        assert case.language == language
        assert case.expect["region"]


def test_region_expectation_accepts_any_listed_form_and_requires_none_when_null() -> None:
    discover = interpretation(
        kind="discover_artist",
        artists=["Radiohead"],
        filters={
            "region": "Argentine",
            "femaleVocals": False,
            "releaseRange": None,
            "excludeLive": False,
        },
    )
    plain = interpretation(kind="discover_artist", artists=["Radiohead"])

    assert check_case({"outcome": "interpreted", "region": ["argentine"]}, discover) == []
    assert check_case({"outcome": "interpreted", "region": ["Brasil"]}, discover) == [
        "region: expected one of ['Brasil'], got Argentine"
    ]
    assert check_case({"outcome": "interpreted", "region": None}, plain) == []
    assert check_case({"outcome": "interpreted", "region": None}, discover) == [
        "region: expected none, got Argentine"
    ]


def test_historical_v3_dataset_stays_frozen_and_inside_v4() -> None:
    digest = hashlib.sha256(HISTORICAL_V3_DATASET_PATH.read_bytes()).hexdigest()
    version, cases = load_dataset(HISTORICAL_V3_DATASET_PATH)

    assert digest == HISTORICAL_V3_DATASET_SHA256
    assert version == "intent-eval-v3"
    assert DATASET_PATH != HISTORICAL_V3_DATASET_PATH
    for case in cases:
        assert_carried_over(case)


GENRE_COVERAGE = {
    "es": {
        "es-artist-nationality-artists-of-rock": ["rock"],
        "es-artist-nationality-rock-by-artists": ["rock"],
        "es-genre-instrumental": ["instrumental"],
        "es-genre-instrumental-calm": ["instrumental"],
        "es-genre-instrumental-acoustic-guitar": ["instrumental acoustic guitar"],
        "es-genre-acoustic": ["acoustic"],
        "es-genre-unknown-fictional": ["glorptrance"],
    },
    "en": {
        "en-artist-nationality-rock-by-artists": ["rock"],
        "en-genre-instrumental": ["instrumental"],
        "en-genre-instrumental-calm": ["instrumental"],
        "en-genre-instrumental-acoustic-guitar": ["instrumental acoustic guitar"],
        "en-genre-broad-exact": ["latin"],
        "en-genre-unknown-fictional": ["glorptrance"],
    },
    "pt": {
        "pt-artist-nationality-rock-by-artists": ["rock"],
        "pt-genre-instrumental": ["instrumental"],
        "pt-genre-instrumental-calm": ["instrumental"],
    },
}


@pytest.mark.parametrize("language", sorted(GENRE_COVERAGE))
def test_dataset_covers_genre_semantics_in_each_language(language: str) -> None:
    by_id = {case.id: case for case in CASES}

    for case_id, genres in GENRE_COVERAGE[language].items():
        case = by_id[case_id]
        assert case.language == language
        assert case.expect["genres"] == genres


LOCAL_GENRE_ALTERNATIVES = {
    "es-genre-place-rock-de-argentina": ("es", "argentine rock", "rock argentino"),
    "es-genre-place-rock-argentino": ("es", "rock argentino", "argentine rock"),
    "es-genre-place-hour": ("es", "rock argentino", "argentine rock"),
    "en-genre-place-argentine-rock": ("en", "argentine rock", "rock argentino"),
    "pt-genre-place-rock-argentino": ("pt", "rock argentino", "argentine rock"),
    "pt-genre-place-jazz-brasileiro": ("pt", "jazz brasileiro", "brazilian jazz"),
    "es-genre-local-pop-argentino": ("es", "pop argentino", "argentine pop"),
    "es-genre-local-trap-argentino": ("es", "trap argentino", "argentine trap"),
    "es-genre-local-folklore-argentino": ("es", "folklore argentino", "argentine folklore"),
    "en-genre-local-argentine-pop": ("en", "argentine pop", "pop argentino"),
    "en-genre-local-brazilian-funk": ("en", "brazilian funk", "funk carioca"),
    "pt-genre-local-trap-brasileiro": ("pt", "trap brasileiro", "brazilian trap"),
    "pt-genre-local-mpb": ("pt", "mpb", "brazilian popular music"),
    "es-every-filter": ("es", "rock argentino", "argentine rock"),
}


APPROVED_GENRE_EQUIVALENTS = {
    frozenset(forms) for _language, *forms in LOCAL_GENRE_ALTERNATIVES.values()
}


def test_dataset_offers_genre_alternatives_only_for_approved_equivalents() -> None:
    with_alternatives = {case.id for case in CASES if "genresOneOf" in case.expect}

    assert with_alternatives == set(LOCAL_GENRE_ALTERNATIVES)
    assert {
        frozenset({"pop argentino", "argentine pop"}),
        frozenset({"trap argentino", "argentine trap"}),
        frozenset({"folklore argentino", "argentine folklore"}),
        frozenset({"funk carioca", "brazilian funk"}),
        frozenset({"trap brasileiro", "brazilian trap"}),
        frozenset({"mpb", "brazilian popular music"}),
        frozenset({"rock argentino", "argentine rock"}),
        frozenset({"jazz brasileiro", "brazilian jazz"}),
    } == APPROVED_GENRE_EQUIVALENTS


def test_check_accepts_only_the_approved_forms_of_a_local_genre() -> None:
    by_id = {case.id: case.expect for case in CASES}
    rock = by_id["es-genre-place-rock-argentino"]
    jazz = by_id["pt-genre-place-jazz-brasileiro"]

    def failed_keys(expect: dict[str, Any], genres: list[str]) -> list[str]:
        result = interpretation(kind="genre_mix", artists=[], excludeArtists=[], genres=genres)
        return [failure.split(":")[0] for failure in check_case(expect, result)]

    assert failed_keys(rock, ["Rock Argentino"]) == []
    assert failed_keys(rock, ["argentine rock"]) == []
    assert failed_keys(jazz, ["jazz brasileiro"]) == []
    assert failed_keys(jazz, ["Brazilian Jazz"]) == []
    for genres in (["rock"], ["rock nacional"], ["rock de argentina"], ["argentine rock", "rock"]):
        assert failed_keys(rock, genres) == ["genresOneOf"]
    assert failed_keys(jazz, ["jazz"]) == ["genresOneOf"]


@pytest.mark.parametrize("case_id", sorted(LOCAL_GENRE_ALTERNATIVES))
def test_dataset_accepts_a_local_genre_name_or_its_supported_english_form(case_id: str) -> None:
    case = next(case for case in CASES if case.id == case_id)
    language, *forms = LOCAL_GENRE_ALTERNATIVES[case_id]

    assert case.language == language
    assert "genres" not in case.expect
    assert case.expect["genresOneOf"] == [[form] for form in forms]
    assert case.expect["unsupportedCategories"] == []


def test_check_accepts_any_listed_genre_alternative() -> None:
    expect = {"outcome": "interpreted", "genresOneOf": [["pop argentino"], ["argentine pop"]]}

    assert check_case(expect, interpretation(genres=["Argentine Pop"])) == []
    assert check_case(expect, interpretation(genres=["pop argentino"])) == []
    assert [
        failure.split(":")[0]
        for failure in check_case(expect, interpretation(genres=["argentine rock"]))
    ] == ["genresOneOf"]


def test_dataset_separates_a_style_place_from_an_artist_nationality() -> None:
    nationality = [case for case in CASES if "-artist-nationality-" in case.id]
    place = [case for case in CASES if "-genre-place-" in case.id]

    assert {case.language for case in nationality} == {"en", "es", "pt"}
    for case in nationality:
        assert case.expect["genres"] == ["rock"]
        assert case.expect["unsupportedCategories"] == ["artist_attribute"]
    for case in place:
        assert "artist_attribute" not in case.expect["unsupportedCategories"]


def test_dataset_never_duplicates_a_genre_style_as_unsupported() -> None:
    instrumental = [case for case in CASES if case.expect.get("genres") == ["instrumental"]]

    assert {case.language for case in instrumental} == {"en", "es", "pt"}
    for case in instrumental:
        assert case.expect["unsupportedCategories"] == []
    assert {case.expect.get("mood") for case in instrumental} == {None, "calm"}


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

    running = next(case for case in CASES if case.id == "en-mood-activity-running")

    assert running.expect["mood"] == "energetic"
    assert running.expect["unsupportedCategoriesWithin"] == ["activity"]

    long_run = next(case for case in CASES if case.id == "en-activity-only")

    assert long_run.prompt == "Music for a long run"
    assert long_run.expect["unsupportedCategories"] == ["activity"]


def test_dataset_never_force_fits_a_musical_characteristic_into_a_mood() -> None:
    groovy = next(case for case in CASES if case.id == "en-characteristic-is-not-a-mood")

    assert groovy.prompt == "Groovy funk music"
    assert groovy.expect["genres"] == ["funk"]
    assert groovy.expect["mood"] is None
    assert groovy.expect["unsupportedCategories"] == ["other"]


def test_dataset_never_reports_a_supported_duration_as_unsupported() -> None:
    duration_only = next(case for case in CASES if case.id == "en-duration-without-basis")

    assert duration_only.prompt == "Music for about 45 minutes"
    assert duration_only.expect["clarificationReason"] == "ambiguous_request"
    assert duration_only.expect["unsupportedCategories"] == []


def test_dataset_never_duplicates_a_canonicalized_mood_as_unsupported() -> None:
    sentimental = next(case for case in CASES if case.id == "es-mood-sentimental-nostalgic")

    assert sentimental.expect["mood"] == "nostalgic"
    assert sentimental.expect["unsupportedCategories"] == []


def test_dataset_never_infers_an_era_from_a_nostalgic_mood() -> None:
    nostalgic = next(case for case in CASES if case.id == "en-mood-nostalgic-only")
    nostalgic_era = next(case for case in CASES if case.id == "en-mood-nostalgic-era")

    assert nostalgic.expect["mood"] == "nostalgic"
    assert nostalgic.expect["unsupportedCategories"] == []
    assert "releaseRange" not in nostalgic.expect
    assert nostalgic_era.expect["mood"] == "nostalgic"
    assert nostalgic_era.expect["releaseRange"] == {"fromYear": 1990, "toYear": 1999}


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


@pytest.mark.parametrize("case", CASES, ids=lambda case: case.id)
def test_every_clarification_case_states_its_reason(case: EvalCase) -> None:
    if case.expect["outcome"] == "needs_clarification":
        assert case.expect.get("clarificationReason") in REASONS


INJECTION_CASES = {
    "en": ["en-prompt-injection", "en-injection-schema-and-tools"],
    "es": ["es-injection-fake-system-text"],
    "pt": ["pt-injection-fake-assistant-text", "pt-injection-secrets-only"],
}


@pytest.mark.parametrize("language", sorted(INJECTION_CASES))
def test_dataset_covers_prompt_injection_in_each_language(language: str) -> None:
    by_id = {case.id: case for case in CASES}

    for case_id in INJECTION_CASES[language]:
        case = by_id[case_id]
        assert case.language == language
        if case.expect["outcome"] == "interpreted":
            assert case.expect["artists"]
        else:
            assert case.expect["clarificationReason"] == "not_a_playlist_request"


def test_dataset_keeps_unsupported_limits_and_unstated_lengths_out_of_executable_fields() -> None:
    by_id = {case.id: case for case in CASES}

    for case_id in ("en-per-artist-limit", "es-per-artist-limit"):
        assert by_id[case_id].expect["unsupportedCategories"] == ["other"]
    assert by_id["es-per-artist-limit"].expect["targetTrackCount"] is None
    long_playlist = by_id["es-duration-long-without-amount"].expect
    assert long_playlist["targetDurationMinutes"] is None
    assert long_playlist["unsupportedCategories"] == ["duration"]
    liked = by_id["en-provider-contents-liked-songs"].expect
    assert liked["seedTrackTitles"] == []
    assert liked["unsupportedCategories"] == ["other"]


@pytest.mark.parametrize(
    "leak",
    [
        "spotify:artist:6olE6TJLqED3rqDCT0FyPh",
        "https://open.spotify.com/artist/x",
        "6olE6TJLqED3rqDCT0FyPh",
    ],
)
def test_check_rejects_identifiers_uris_and_urls_anywhere_in_the_output(leak: str) -> None:
    expect = {"outcome": "interpreted", "artists": ["Radiohead", "Interpol"]}
    leaked = interpretation(
        unsupportedConstraints=[{"category": "other", "userText": f"catalog ID {leak}"}]
    )

    failures = check_case(expect, leaked)

    assert [failure.split(":")[0] for failure in failures] == ["identifiers"]


def test_check_compares_unsupported_categories_as_a_set() -> None:
    expect = {"outcome": "interpreted", "unsupportedCategories": ["other"]}
    twice = interpretation(
        unsupportedConstraints=[
            {"category": "other", "userText": "groovy"},
            {"category": "other", "userText": "heavy"},
        ]
    )
    missing = interpretation(unsupportedConstraints=[])

    assert check_case(expect, twice) == []
    assert check_case(expect, missing) == ["unsupportedCategories: expected ['other'], got []"]
    assert check_case({"outcome": "interpreted", "unsupportedCategories": []}, twice) == [
        "unsupportedCategories: expected [], got ['other']"
    ]


def test_check_never_accepts_a_missing_clarification() -> None:
    expect = {"outcome": "needs_clarification", "clarificationReason": "not_a_playlist_request"}

    assert check_case(expect, interpretation()) == [
        "outcome: expected needs_clarification, got interpreted"
    ]
