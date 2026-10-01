import json
import re
import unicodedata
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel

from app.models.intent import (
    ClarificationNeeded,
    IntentTrackReference,
    InterpretedIntent,
    PlaylistIntent,
)

DATASET_PATH = Path(__file__).resolve().parent / "intent-eval-v6.json"

EvalLanguage = Literal["en", "es", "pt"]
ExpectationStatus = Literal["passed", "failed", "unchecked"]
Interpretation = InterpretedIntent | ClarificationNeeded

NAME_LIST_EXPECTATIONS = ("artists", "genres", "excludeArtists")
GENRE_ALTERNATIVES_EXPECTATION = "genresOneOf"
SCALAR_EXPECTATIONS = (
    "kind",
    "targetTrackCount",
    "targetDurationMinutes",
    "mood",
    "popularity",
    "orderMode",
)
TRACK_EXPECTATIONS = ("seedTrackTitles", "seedTrackArtists", "excludeTrackTitles")
REGION_EXPECTATION = "region"
FILTER_EXPECTATIONS = ("femaleVocals", "releaseRange", "excludeLive")
CATEGORY_EXPECTATIONS = ("unsupportedCategories", "unsupportedCategoriesWithin")
IDENTIFIERS_CHECK = "identifiers"
IDENTIFIER_PATTERN = re.compile(r"spotify:|open\.spotify|https?://|\b[0-9A-Za-z]{22}\b")
EXPECTATION_KEYS = frozenset(
    {
        "outcome",
        "clarificationReason",
        *NAME_LIST_EXPECTATIONS,
        GENRE_ALTERNATIVES_EXPECTATION,
        *SCALAR_EXPECTATIONS,
        *TRACK_EXPECTATIONS,
        REGION_EXPECTATION,
        *FILTER_EXPECTATIONS,
        *CATEGORY_EXPECTATIONS,
    }
)


@dataclass(frozen=True, slots=True)
class EvalCase:
    id: str
    language: EvalLanguage
    prompt: str
    expect: dict[str, Any]


def load_dataset(path: Path = DATASET_PATH) -> tuple[str, list[EvalCase]]:
    content = json.loads(path.read_text())
    cases = [
        EvalCase(
            id=case["id"],
            language=case["language"],
            prompt=case["prompt"],
            expect=case["expect"],
        )
        for case in content["cases"]
    ]
    return content["version"], cases


def check_case(expect: dict[str, Any], interpretation: Interpretation) -> list[str]:
    return [*check_no_identifiers(interpretation), *_check_semantics(expect, interpretation)]


def check_no_identifiers(output: BaseModel) -> list[str]:
    leaked = sorted(
        {
            text
            for text in _string_values(output.model_dump(mode="json"))
            if IDENTIFIER_PATTERN.search(text)
        }
    )
    if not leaked:
        return []
    return [f"{IDENTIFIERS_CHECK}: output contains identifiers, URIs or URLs {leaked}"]


def _string_values(value: object) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [text for child in value.values() for text in _string_values(child)]
    if isinstance(value, list):
        return [text for child in value for text in _string_values(child)]
    return []


def _check_semantics(expect: dict[str, Any], interpretation: Interpretation) -> list[str]:
    failures: list[str] = []

    if interpretation.outcome != expect["outcome"]:
        return [f"outcome: expected {expect['outcome']}, got {interpretation.outcome}"]

    if isinstance(interpretation, ClarificationNeeded):
        clarification = interpretation.clarification
        reason = expect.get("clarificationReason")
        if reason is not None and clarification.reason != reason:
            failures.append(f"clarificationReason: expected {reason}, got {clarification.reason}")
        categories = [item.category for item in clarification.unsupported_constraints]
        failures.extend(_check_categories(expect, categories))
        return failures

    intent = interpretation.intent
    failures.extend(_check_names(expect, intent))
    failures.extend(_check_scalars(expect, intent))
    failures.extend(_check_tracks(expect, intent))
    failures.extend(_check_region(expect, intent))
    failures.extend(_check_filters(expect, intent))
    categories = [item.category for item in intent.unsupported_constraints]
    failures.extend(_check_categories(expect, categories))
    return failures


def expectation_statuses(
    expect: dict[str, Any], failures: Sequence[str] | None
) -> dict[str, ExpectationStatus]:
    if failures is None:
        return dict.fromkeys([*expect, IDENTIFIERS_CHECK], "unchecked")

    failed_keys = {failure.split(":", 1)[0] for failure in failures}
    outcome_failed = "outcome" in failed_keys
    return {
        **{
            key: "failed" if key in failed_keys else "unchecked" if outcome_failed else "passed"
            for key in expect
        },
        IDENTIFIERS_CHECK: "failed" if IDENTIFIERS_CHECK in failed_keys else "passed",
    }


def tally_expectations(
    statuses: Iterable[dict[str, ExpectationStatus]],
) -> dict[str, dict[ExpectationStatus, int]]:
    tally: dict[str, dict[ExpectationStatus, int]] = {}
    for case_statuses in statuses:
        for key, status in case_statuses.items():
            counts = tally.setdefault(key, {"passed": 0, "failed": 0, "unchecked": 0})
            counts[status] += 1
    return dict(sorted(tally.items()))


def normalize_name(name: str | None) -> str | None:
    if name is None:
        return None
    return " ".join(unicodedata.normalize("NFC", name).casefold().split())


def _check_names(expect: dict[str, Any], intent: PlaylistIntent) -> list[str]:
    actual_by_key = {
        "artists": intent.artists,
        "genres": intent.genres,
        "excludeArtists": intent.exclude_artists,
    }
    failures = [
        failure
        for key in NAME_LIST_EXPECTATIONS
        if key in expect
        for failure in _compare_sets(key, expect[key], actual_by_key[key])
    ]
    alternatives = expect.get(GENRE_ALTERNATIVES_EXPECTATION)
    if alternatives is not None and all(
        _compare_sets(GENRE_ALTERNATIVES_EXPECTATION, genres, intent.genres)
        for genres in alternatives
    ):
        actual = sorted(map(str, map(normalize_name, intent.genres)))
        failures.append(
            f"{GENRE_ALTERNATIVES_EXPECTATION}: expected one of {alternatives}, got {actual}"
        )
    return failures


def _check_scalars(expect: dict[str, Any], intent: PlaylistIntent) -> list[str]:
    actual_by_key = {
        "kind": intent.kind,
        "targetTrackCount": intent.target_track_count,
        "targetDurationMinutes": intent.target_duration_minutes,
        "mood": intent.mood,
        "popularity": intent.popularity,
        "orderMode": intent.order_mode,
    }
    return [
        f"{key}: expected {expect[key]}, got {actual_by_key[key]}"
        for key in SCALAR_EXPECTATIONS
        if key in expect and expect[key] != actual_by_key[key]
    ]


def _check_region(expect: dict[str, Any], intent: PlaylistIntent) -> list[str]:
    if REGION_EXPECTATION not in expect:
        return []
    accepted = expect[REGION_EXPECTATION]
    actual = intent.filters.region
    if accepted is None:
        return [] if actual is None else [f"region: expected none, got {actual}"]
    if normalize_name(actual) in {normalize_name(value) for value in accepted}:
        return []
    return [f"region: expected one of {accepted}, got {actual}"]


def _check_filters(expect: dict[str, Any], intent: PlaylistIntent) -> list[str]:
    filters = intent.filters.model_dump(mode="json", by_alias=True)
    return [
        f"{key}: expected {expect[key]}, got {filters[key]}"
        for key in FILTER_EXPECTATIONS
        if key in expect and expect[key] != filters[key]
    ]


def _check_tracks(expect: dict[str, Any], intent: PlaylistIntent) -> list[str]:
    actual_by_key = {
        "seedTrackTitles": _titles(intent.seed_tracks),
        "seedTrackArtists": [track.artist for track in intent.seed_tracks],
        "excludeTrackTitles": _titles(intent.exclude_tracks),
    }
    return [
        failure
        for key in TRACK_EXPECTATIONS
        if key in expect
        for failure in _compare_sets(key, expect[key], actual_by_key[key])
    ]


def _check_categories(expect: dict[str, Any], categories: Sequence[str]) -> list[str]:
    failures: list[str] = []

    if "unsupportedCategories" in expect:
        failures.extend(compare_categories(expect["unsupportedCategories"], categories))
    if "unsupportedCategoriesWithin" in expect:
        allowed = set(expect["unsupportedCategoriesWithin"])
        if not categories or not set(categories) <= allowed:
            failures.append(
                f"unsupportedCategoriesWithin: expected a non-empty subset of {sorted(allowed)}, "
                f"got {sorted(categories)}"
            )
    return failures


def compare_categories(expected: Iterable[str], categories: Iterable[str]) -> list[str]:
    expected_categories = sorted(set(expected))
    actual_categories = sorted(set(categories))
    if expected_categories == actual_categories:
        return []
    return [f"unsupportedCategories: expected {expected_categories}, got {actual_categories}"]


def _compare_sets(
    key: str, expected: Iterable[str | None], actual: Iterable[str | None]
) -> list[str]:
    expected_names = sorted(map(str, map(normalize_name, expected)))
    actual_names = sorted(map(str, map(normalize_name, actual)))
    if expected_names == actual_names:
        return []
    return [f"{key}: expected {expected_names}, got {actual_names}"]


def _titles(tracks: Sequence[IntentTrackReference]) -> list[str]:
    return [track.title for track in tracks]
