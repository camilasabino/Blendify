import hashlib

from app.models.intent import Mood
from app.prompts.intent import (
    INTENT_PROMPT_VERSION,
    INTENT_SYSTEM_PROMPT,
    build_intent_model_request,
)
from app.prompts.intent_v1 import INTENT_V1_PROMPT_VERSION, INTENT_V1_SYSTEM_PROMPT
from app.prompts.intent_v2 import INTENT_V2_PROMPT_VERSION, INTENT_V2_SYSTEM_PROMPT
from app.prompts.intent_v3 import INTENT_V3_PROMPT_VERSION, INTENT_V3_SYSTEM_PROMPT
from app.prompts.intent_v4 import INTENT_V4_PROMPT_VERSION, INTENT_V4_SYSTEM_PROMPT
from app.prompts.intent_v5 import INTENT_V5_PROMPT_VERSION, INTENT_V5_SYSTEM_PROMPT

INTENT_V1_BASELINE_SHA256 = "6f765db08aaf50eee3d7934fccbf8ebcbc132a18ee53d9acd1fd78b3dc4fbcb5"
INTENT_V2_BASELINE_SHA256 = "274418d1f63e9f9ef65fe99f62af3027dffeece6783f933afe86c786ad3e64c2"
INTENT_V3_BASELINE_SHA256 = "4a523cd6a58f3ef21e0812fa209e4466289dc768eb682358474ac1bde7d8cf8f"
INTENT_V4_BASELINE_SHA256 = "6a8789ecde010f09c1a61c52d48a0234291ee40c7fab27083ab5028de6a59e28"
INTENT_V5_BASELINE_SHA256 = "41b1c37f1c28b2cac7f8d528f7a32ed86c39e322b5f439632660349ac8cfeff9"


def flat(prompt: str) -> str:
    return " ".join(prompt.split())


def test_current_prompt_is_intent_v6() -> None:
    request = build_intent_model_request("Pop music for an hour")

    assert INTENT_PROMPT_VERSION == "intent-v6"
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


def test_intent_v3_stays_frozen_for_the_accepted_m2_baseline() -> None:
    digest = hashlib.sha256(INTENT_V3_SYSTEM_PROMPT.encode()).hexdigest()

    assert INTENT_V3_PROMPT_VERSION == "intent-v3"
    assert digest == INTENT_V3_BASELINE_SHA256
    assert INTENT_V3_SYSTEM_PROMPT != INTENT_SYSTEM_PROMPT


def test_intent_v5_stays_frozen_for_the_accepted_baseline() -> None:
    digest = hashlib.sha256(INTENT_V5_SYSTEM_PROMPT.encode()).hexdigest()

    assert INTENT_V5_PROMPT_VERSION == "intent-v5"
    assert digest == INTENT_V5_BASELINE_SHA256
    assert INTENT_V5_SYSTEM_PROMPT != INTENT_SYSTEM_PROMPT


def test_current_prompt_interprets_vocal_release_and_live_filters() -> None:
    prompt = flat(INTENT_SYSTEM_PROMPT)

    assert "filters.femaleVocals: true when the user asks for female vocals" in prompt
    assert "never who the artists are" in prompt
    assert '"solo mujeres"' in prompt
    assert "Never infer it from artist names" in prompt
    assert "filters.releaseRange: the years the songs were released" in prompt
    assert '"onda ochentosa"' in prompt
    assert '"after 2015" start in 2016' in prompt
    assert '"Antes de 2000" and "before 2000" end in 1999' in prompt
    assert "filters.excludeLive: true only when the user asks to leave out live versions" in prompt
    assert "It leaves out only live and unplugged performances" in prompt
    assert '"solo grabaciones de estudio"' in prompt
    assert "Never set excludeLive for it" in prompt
    assert "female vocalists" not in prompt
    assert "Last.fm" not in prompt
    assert "Spotify" not in prompt
    assert "release_date" not in prompt


def test_intent_v4_stays_frozen_for_the_accepted_baseline() -> None:
    digest = hashlib.sha256(INTENT_V4_SYSTEM_PROMPT.encode()).hexdigest()

    assert INTENT_V4_PROMPT_VERSION == "intent-v4"
    assert digest == INTENT_V4_BASELINE_SHA256
    assert INTENT_V4_SYSTEM_PROMPT != INTENT_SYSTEM_PROMPT


def test_current_prompt_restricts_results_by_region_without_listing_aliases() -> None:
    prompt = flat(INTENT_SYSTEM_PROMPT)

    assert "filters.region: the country, region or regional scene" in prompt
    assert "copied as the user wrote it" in prompt
    assert "canciones parecidas a Creep pero brasileras" in prompt
    assert "10 canciones de Radiohead argentinas" in prompt
    assert "Blendify decides whether the region can apply" in prompt
    assert "a place that describes the style stays in the genre" in prompt
    assert "except a region written in filters.region" in prompt
    assert "Last.fm" not in prompt
    assert "brazilian" not in prompt


def test_current_prompt_keeps_artist_and_song_names_untranslated() -> None:
    prompt = flat(INTENT_SYSTEM_PROMPT)

    assert "Copy artist and song names as the user wrote them" in prompt
    assert "Never translate them and never replace them with other names" in prompt
    assert "Copy artist, song and genre names" not in prompt


def test_current_prompt_normalizes_genre_expressions_by_meaning() -> None:
    prompt = flat(INTENT_SYSTEM_PROMPT)

    for rule in (
        "A genre is a style of music, not a proper name",
        '"rock de argentina" and "rock argentino" are "argentine rock"',
        '"música instrumental" is "instrumental"',
        "Keep a genre name that is already established in the user's language as written",
        "Never make a genre broader or narrower, and never guess which genres exist",
    ):
        assert rule in prompt


def test_current_prompt_separates_a_style_place_from_an_artist_nationality() -> None:
    prompt = flat(INTENT_SYSTEM_PROMPT)

    assert "A place or nationality that describes the style is part of the genre" in prompt
    assert "describes the people who make the music is an artist_attribute" in prompt
    for example in ('"rock by Argentine artists"', '"artistas argentinos de rock"'):
        assert example in prompt
    assert "a country name alone never makes a genre" in prompt


def test_current_prompt_lets_a_characteristic_be_the_requested_genre() -> None:
    prompt = flat(INTENT_SYSTEM_PROMPT)

    assert "When the user asks for one as the kind of music itself" in prompt
    assert '"Música instrumental relajante" is genre "instrumental" plus mood "calm"' in prompt
    assert "never reported again under unsupportedConstraints" in prompt


def test_current_prompt_never_receives_the_curated_catalog() -> None:
    catalog_only_labels = ("Instrumental Acoustic Guitar", "calming instrumental", "argentine-rock")

    for label in catalog_only_labels:
        assert label not in INTENT_SYSTEM_PROMPT
    assert "spotify-genres" not in INTENT_SYSTEM_PROMPT


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
