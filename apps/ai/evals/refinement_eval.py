import json
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.models.intent import IntentTrackReference
from app.models.refinement import (
    ClearValue,
    InterpretedRefinement,
    NameListPatch,
    PlanRefinementRequest,
    PositionListPatch,
    RefinementClarificationNeeded,
    TrackListPatch,
)
from evals.intent_eval import (
    EvalLanguage,
    check_no_identifiers,
    compare_categories,
    normalize_name,
)

DATASET_PATH = Path(__file__).resolve().parent / "refinement-eval-v2.json"

RefinementResult = InterpretedRefinement | RefinementClarificationNeeded
ListPatch = NameListPatch | TrackListPatch | PositionListPatch
PatchValue = str | int
PatchItem = str | int | IntentTrackReference

SCALAR_PATHS = (
    "kind",
    "targetTrackCount",
    "targetDurationMinutes",
    "mood",
    "popularity",
    "orderMode",
    "preservation.firstTracks",
)
LIST_PATHS = (
    "artists",
    "genres",
    "seedTracks",
    "excludeArtists",
    "excludeTracks",
    "preservation.positions",
    "preservation.artists",
)
PATCH_PATHS = frozenset({*SCALAR_PATHS, *LIST_PATHS})
EXPECTATION_KEYS = frozenset(
    {
        "outcome",
        "clarificationReason",
        "changed",
        "changedWithin",
        "set",
        "setIfChanged",
        "clear",
        "add",
        "addOneOf",
        "remove",
        "removeOneOf",
        "unsupportedCategories",
        "unsupportedCategoriesWithin",
    }
)


@dataclass(frozen=True, slots=True)
class RefinementEvalCase:
    id: str
    language: EvalLanguage
    request: PlanRefinementRequest
    expect: dict[str, Any]


def load_dataset(path: Path = DATASET_PATH) -> tuple[str, list[RefinementEvalCase]]:
    content = json.loads(path.read_text())
    cases = [
        RefinementEvalCase(
            id=case["id"],
            language=case["language"],
            request=PlanRefinementRequest.model_validate(
                {
                    "intent": case["intent"],
                    "preservation": case["preservation"],
                    "refinement": case["refinement"],
                }
            ),
            expect=case["expect"],
        )
        for case in content["cases"]
    ]
    return content["version"], cases


def check_refinement_case(expect: dict[str, Any], result: RefinementResult) -> list[str]:
    return [*check_no_identifiers(result), *_check_semantics(expect, result)]


def _check_semantics(expect: dict[str, Any], result: RefinementResult) -> list[str]:
    allowed_outcomes = _as_list(expect["outcome"])
    if result.outcome not in allowed_outcomes:
        return [f"outcome: expected one of {allowed_outcomes}, got {result.outcome}"]

    if isinstance(result, RefinementClarificationNeeded):
        failures: list[str] = []
        reasons = _as_list(expect.get("clarificationReason", []))
        if reasons and result.clarification.reason not in reasons:
            failures.append(
                f"clarificationReason: expected one of {reasons}, got {result.clarification.reason}"
            )
        categories = [item.category for item in result.clarification.unsupported_constraints]
        failures.extend(_check_categories(expect, categories))
        return failures

    scalars = _scalar_operations(result)
    lists = _list_operations(result)
    changed = sorted(
        [path for path, operation in scalars.items() if operation is not None]
        + [path for path, operation in lists.items() if operation.add or operation.remove]
    )
    categories = [item.category for item in result.unsupported_constraints]
    return [
        *_check_changed(expect, changed),
        *_check_scalars(expect, scalars),
        *_check_lists(expect, lists),
        *_check_categories(expect, categories),
    ]


def _scalar_operations(result: InterpretedRefinement) -> dict[str, Any]:
    patch = result.patch
    return {
        "kind": patch.kind,
        "targetTrackCount": patch.target_track_count,
        "targetDurationMinutes": patch.target_duration_minutes,
        "mood": patch.mood,
        "popularity": patch.popularity,
        "orderMode": patch.order_mode,
        "preservation.firstTracks": result.preservation.first_tracks,
    }


def _list_operations(result: InterpretedRefinement) -> dict[str, ListPatch]:
    patch = result.patch
    return {
        "artists": patch.artists,
        "genres": patch.genres,
        "seedTracks": patch.seed_tracks,
        "excludeArtists": patch.exclude_artists,
        "excludeTracks": patch.exclude_tracks,
        "preservation.positions": result.preservation.positions,
        "preservation.artists": result.preservation.artists,
    }


def _check_changed(expect: dict[str, Any], changed: list[str]) -> list[str]:
    failures: list[str] = []

    if "changed" in expect and sorted(expect["changed"]) != changed:
        failures.append(f"changed: expected {sorted(expect['changed'])}, got {changed}")
    if "changedWithin" in expect and not set(changed) <= set(expect["changedWithin"]):
        failures.append(
            f"changedWithin: expected a subset of {sorted(expect['changedWithin'])}, got {changed}"
        )
    return failures


def _check_scalars(expect: dict[str, Any], scalars: dict[str, Any]) -> list[str]:
    failures: list[str] = []

    for path, value in expect.get("set", {}).items():
        actual = _set_value(scalars[path])
        if actual != value:
            failures.append(f"set: expected {path} = {value}, got {_describe(scalars[path])}")
    for path, value in expect.get("setIfChanged", {}).items():
        operation = scalars[path]
        if operation is not None and _set_value(operation) != value:
            failures.append(
                f"setIfChanged: expected {path} unchanged or {value}, got {_describe(operation)}"
            )
    for path in expect.get("clear", []):
        if not isinstance(scalars[path], ClearValue):
            failures.append(f"clear: expected {path} cleared, got {_describe(scalars[path])}")
    return failures


def _check_lists(expect: dict[str, Any], lists: dict[str, ListPatch]) -> list[str]:
    failures: list[str] = []

    for direction in ("add", "remove"):
        for path, expected in expect.get(direction, {}).items():
            actual = getattr(lists[path], direction)
            expected_items = _comparable(expected)
            actual_items = _comparable(actual)
            if expected_items != actual_items:
                failures.append(
                    f"{direction}: expected {path} {expected_items}, got {actual_items}"
                )
        for path, alternatives in expect.get(f"{direction}OneOf", {}).items():
            actual_items = _comparable(getattr(lists[path], direction))
            if actual_items not in [_comparable(items) for items in alternatives]:
                failures.append(
                    f"{direction}OneOf: expected {path} one of {alternatives}, got {actual_items}"
                )
    return failures


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


def _set_value(operation: Any) -> PatchValue | None:
    if operation is None or isinstance(operation, ClearValue):
        return None
    return operation.value


def _describe(operation: Any) -> str:
    if operation is None:
        return "unchanged"
    if isinstance(operation, ClearValue):
        return "clear"
    return f"set {operation.value}"


def _comparable(items: Iterable[PatchItem | dict[str, Any]]) -> list[str]:
    return sorted(str(_item_key(item)) for item in items)


def _item_key(item: PatchItem | dict[str, Any]) -> str | int | None:
    if isinstance(item, IntentTrackReference):
        return normalize_name(item.title)
    if isinstance(item, dict):
        return normalize_name(item["title"])
    if isinstance(item, str):
        return normalize_name(item)
    return item


def _as_list(value: str | list[str]) -> list[str]:
    return [value] if isinstance(value, str) else list(value)
