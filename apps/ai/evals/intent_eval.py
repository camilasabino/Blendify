import json
import unicodedata
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from app.models.intent import (
    ClarificationNeeded,
    IntentTrackReference,
    InterpretedIntent,
    PlaylistIntent,
)

DATASET_PATH = Path(__file__).resolve().parent / "intent-eval-v3.json"

EvalLanguage = Literal["en", "es", "pt"]
ExpectationStatus = Literal["passed", "failed", "unchecked"]
Interpretation = InterpretedIntent | ClarificationNeeded

NAME_LIST_EXPECTATIONS = ("artists", "genres", "excludeArtists")
SCALAR_EXPECTATIONS = (
    "kind",
    "targetTrackCount",
    "targetDurationMinutes",
    "mood",
    "popularity",
    "orderMode",
)
TRACK_EXPECTATIONS = ("seedTrackTitles", "seedTrackArtists", "excludeTrackTitles")
CATEGORY_EXPECTATIONS = ("unsupportedCategories", "unsupportedCategoriesWithin")
EXPECTATION_KEYS = frozenset(
    {
        "outcome",
        "clarificationReason",
        *NAME_LIST_EXPECTATIONS,
        *SCALAR_EXPECTATIONS,
        *TRACK_EXPECTATIONS,
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
    categories = [item.category for item in intent.unsupported_constraints]
    failures.extend(_check_categories(expect, categories))
    return failures


def expectation_statuses(
    expect: dict[str, Any], failures: Sequence[str] | None
) -> dict[str, ExpectationStatus]:
    if failures is None:
        return dict.fromkeys(expect, "unchecked")

    failed_keys = {failure.split(":", 1)[0] for failure in failures}
    outcome_failed = "outcome" in failed_keys
    return {
        key: "failed" if key in failed_keys else "unchecked" if outcome_failed else "passed"
        for key in expect
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
    return [
        failure
        for key in NAME_LIST_EXPECTATIONS
        if key in expect
        for failure in _compare_sets(key, expect[key], actual_by_key[key])
    ]


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
        failures.extend(
            _compare_sets("unsupportedCategories", expect["unsupportedCategories"], categories)
        )
    if "unsupportedCategoriesWithin" in expect:
        allowed = set(expect["unsupportedCategoriesWithin"])
        if not categories or not set(categories) <= allowed:
            failures.append(
                f"unsupportedCategoriesWithin: expected a non-empty subset of {sorted(allowed)}, "
                f"got {sorted(categories)}"
            )
    return failures


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
