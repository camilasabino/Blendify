import json
import re
from pathlib import Path
from typing import Any

import pytest

from app.interpretation.structured_model_call import MAX_OUTPUT_VALIDATION_ATTEMPTS
from app.models.intent import Mood, UnsupportedConstraintCategory
from app.models.refinement import refinement_interpretation_adapter
from evals import run_intent_eval
from evals.refinement_eval import (
    DATASET_PATH,
    EXPECTATION_KEYS,
    PATCH_PATHS,
    check_refinement_case,
    load_dataset,
)
from evals.run_intent_eval import REFINEMENT_SUITE, EvalPlan, main, preflight_lines, run_eval
from tests.fakes import (
    ScriptedModelProvider,
    refinement_clarification,
    refinement_output,
    unchanged_patch,
    unchanged_preservation_patch,
)

DATASET_VERSION, CASES = load_dataset()
CASES_BY_ID = {case.id: case for case in CASES}
CATEGORIES = set(UnsupportedConstraintCategory.__args__)
PROVIDER_CONTENT_PATTERN = re.compile(r"spotify:|open\.spotify|https?://|\b[0-9A-Za-z]{22}\b")
REQUIRED_COVERAGE = {
    "en": [
        "en-less-mainstream",
        "en-less-mainstream-from-popular",
        "en-less-mainstream-from-balanced",
        "en-more-mainstream-from-rarities",
        "en-more-mainstream-already-popular",
        "en-deep-cuts-from-popular",
        "en-mix-of-both",
        "en-add-artist",
        "en-remove-seed-artist",
        "en-exclude-artist",
        "en-change-count",
        "en-change-duration",
        "en-change-mood",
        "en-keep-first-n",
        "en-unsupported-activity",
        "en-unsupported-energy-progression",
        "en-already-satisfied",
        "en-prompt-injection",
        "en-combination",
    ],
    "es": [
        "es-less-mainstream",
        "es-less-commercial-from-popular",
        "es-remove-seed-artist",
        "es-add-artist",
        "es-longer-ambiguous",
        "es-preserve-first-tracks",
        "es-unsupported-tempo",
        "es-combination",
    ],
    "pt": [
        "pt-less-popular",
        "pt-less-popular-from-popular",
        "pt-exclude-artist",
        "pt-preserve-first-tracks",
        "pt-unsupported-artist-attribute",
        "pt-combination",
    ],
}


def parsed(output: dict[str, object]) -> Any:
    return refinement_interpretation_adapter.validate_python(output)


def test_dataset_is_a_new_versioned_refinement_dataset_with_unique_ids() -> None:
    ids = [case.id for case in CASES]

    assert DATASET_VERSION == "refinement-eval-v1"
    assert DATASET_PATH.name == "refinement-eval-v1.json"
    assert len(ids) == len(set(ids))


@pytest.mark.parametrize("language", sorted(REQUIRED_COVERAGE))
def test_dataset_covers_the_required_refinements_per_language(language: str) -> None:
    for case_id in REQUIRED_COVERAGE[language]:
        assert CASES_BY_ID[case_id].language == language


def string_values(value: object) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [text for child in value.values() for text in string_values(child)]
    if isinstance(value, list):
        return [text for child in value for text in string_values(child)]
    return []


def test_dataset_contains_only_synthetic_user_authored_state() -> None:
    content = json.loads(DATASET_PATH.read_text())

    assert not [
        text for text in string_values(content["cases"]) if PROVIDER_CONTENT_PATTERN.search(text)
    ]


@pytest.mark.parametrize("case", CASES, ids=lambda case: case.id)
def test_every_expectation_uses_known_keys_paths_and_vocabularies(case: Any) -> None:
    expect = case.expect
    outcomes = expect["outcome"] if isinstance(expect["outcome"], list) else [expect["outcome"]]
    paths = [
        *expect.get("changed", []),
        *expect.get("changedWithin", []),
        *expect.get("set", {}),
        *expect.get("setIfChanged", {}),
        *expect.get("clear", []),
        *expect.get("add", {}),
        *expect.get("remove", {}),
    ]
    categories = expect.get("unsupportedCategories", []) + expect.get(
        "unsupportedCategoriesWithin", []
    )

    assert set(expect) <= EXPECTATION_KEYS
    assert set(outcomes) <= {"interpreted", "needs_clarification"}
    assert set(paths) <= PATCH_PATHS
    assert set(categories) <= CATEGORIES
    if "mood" in expect.get("set", {}):
        assert expect["set"]["mood"] in Mood.__args__


def test_relative_changes_without_an_amount_never_expect_a_number() -> None:
    for case_id in (
        "en-shorter-ambiguous",
        "en-few-more-songs-ambiguous",
        "en-percentage-popularity-ambiguous",
        "es-longer-ambiguous",
    ):
        expect = CASES_BY_ID[case_id].expect
        assert expect["changedWithin"] == []
        assert "set" not in expect


POPULARITY_LESS_MAINSTREAM = {"popular": "balanced", "balanced": "rarities", "rarities": "rarities"}
POPULARITY_MORE_MAINSTREAM = {"rarities": "balanced", "balanced": "popular", "popular": "popular"}
POPULARITY_STEP_CASES = {
    "en-less-mainstream": POPULARITY_LESS_MAINSTREAM,
    "en-less-mainstream-from-popular": POPULARITY_LESS_MAINSTREAM,
    "en-less-mainstream-from-balanced": POPULARITY_LESS_MAINSTREAM,
    "en-already-satisfied": POPULARITY_LESS_MAINSTREAM,
    "en-more-mainstream-from-rarities": POPULARITY_MORE_MAINSTREAM,
    "en-more-mainstream-already-popular": POPULARITY_MORE_MAINSTREAM,
    "es-less-mainstream": POPULARITY_LESS_MAINSTREAM,
    "es-less-commercial-from-popular": POPULARITY_LESS_MAINSTREAM,
    "pt-more-popular": POPULARITY_MORE_MAINSTREAM,
    "pt-less-popular-from-popular": POPULARITY_LESS_MAINSTREAM,
}
POPULARITY_ABSOLUTE_CASES = {
    "en-more-mainstream": ("rarities", "popular"),
    "en-deep-cuts-from-popular": ("popular", "rarities"),
    "en-mix-of-both": ("popular", "balanced"),
}


def expected_popularity(expect: dict[str, Any], current: str | None) -> str | None:
    return expect.get("set", {}).get("popularity") or expect.get("setIfChanged", {}).get(
        "popularity", current
    )


@pytest.mark.parametrize("case_id", sorted(POPULARITY_STEP_CASES))
def test_relative_popularity_expects_exactly_one_step_from_the_current_mode(
    case_id: str,
) -> None:
    case = CASES_BY_ID[case_id]
    current = case.request.intent.popularity

    assert (
        expected_popularity(case.expect, current)
        == POPULARITY_STEP_CASES[case_id][current or "balanced"]
    )


@pytest.mark.parametrize("case_id", sorted(POPULARITY_ABSOLUTE_CASES))
def test_absolute_popularity_expects_the_named_mode_whatever_the_current_one(
    case_id: str,
) -> None:
    current, expected = POPULARITY_ABSOLUTE_CASES[case_id]
    case = CASES_BY_ID[case_id]

    assert case.request.intent.popularity == current
    assert case.expect["set"]["popularity"] == expected


def test_accepts_an_unchanged_popularity_at_the_end_of_the_scale() -> None:
    expect = CASES_BY_ID["en-more-mainstream-already-popular"].expect

    assert check_refinement_case(expect, parsed(refinement_output())) == []
    assert (
        check_refinement_case(
            expect,
            parsed(
                refinement_output(
                    patch=unchanged_patch(popularity={"operation": "set", "value": "popular"})
                )
            ),
        )
        == []
    )
    assert check_refinement_case(
        expect,
        parsed(
            refinement_output(
                patch=unchanged_patch(popularity={"operation": "set", "value": "balanced"})
            )
        ),
    ) == ["setIfChanged: expected popularity unchanged or popular, got set balanced"]


def test_passes_an_output_that_changes_exactly_the_expected_fields() -> None:
    expect = CASES_BY_ID["en-keep-first-n"].expect
    output = refinement_output(
        patch=unchanged_patch(popularity={"operation": "set", "value": "rarities"}),
        preservation=unchanged_preservation_patch(firstTracks={"operation": "set", "value": 5}),
    )

    assert check_refinement_case(expect, parsed(output)) == []


def test_fails_an_output_that_restates_unchanged_fields() -> None:
    expect = CASES_BY_ID["en-less-mainstream"].expect
    output = refinement_output(
        patch=unchanged_patch(
            popularity={"operation": "set", "value": "rarities"},
            targetTrackCount={"operation": "set", "value": 30},
        )
    )

    assert check_refinement_case(expect, parsed(output)) == [
        "changed: expected ['popularity'], got ['popularity', 'targetTrackCount']"
    ]


def test_accepts_equivalent_representations_of_an_already_satisfied_request() -> None:
    expect = CASES_BY_ID["en-already-satisfied"].expect
    restated = refinement_output(
        patch=unchanged_patch(popularity={"operation": "set", "value": "rarities"})
    )
    flipped = refinement_output(
        patch=unchanged_patch(popularity={"operation": "set", "value": "popular"})
    )

    assert check_refinement_case(expect, parsed(refinement_output())) == []
    assert check_refinement_case(expect, parsed(restated)) == []
    assert check_refinement_case(expect, parsed(flipped)) == [
        "setIfChanged: expected popularity unchanged or rarities, got set popular"
    ]


def test_accepts_a_clarification_or_an_empty_patch_for_a_relative_change() -> None:
    expect = CASES_BY_ID["en-shorter-ambiguous"].expect
    shorter = [{"category": "duration", "userText": "shorter"}]
    guessed = refinement_output(
        patch=unchanged_patch(targetTrackCount={"operation": "set", "value": 20})
    )

    assert check_refinement_case(expect, parsed(refinement_output(unsupported=shorter))) == []
    assert (
        check_refinement_case(
            expect, parsed(refinement_clarification("ambiguous_request", shorter))
        )
        == []
    )
    assert check_refinement_case(expect, parsed(guessed)) == [
        "changedWithin: expected a subset of [], got ['targetTrackCount']",
        "unsupportedCategoriesWithin: expected a non-empty subset of ['duration', 'other'], got []",
    ]


def test_checks_list_operations_by_normalized_name_and_clear_operations() -> None:
    swap = CASES_BY_ID["en-swap-artist"].expect
    clear = CASES_BY_ID["en-clear-mood"].expect
    swapped = refinement_output(
        patch=unchanged_patch(artists={"add": ["joy division"], "remove": ["INTERPOL"]})
    )
    set_instead_of_clear = refinement_output(
        patch=unchanged_patch(mood={"operation": "set", "value": "happy"})
    )

    assert check_refinement_case(swap, parsed(swapped)) == []
    assert check_refinement_case(clear, parsed(set_instead_of_clear)) == [
        "clear: expected mood cleared, got set happy"
    ]


def test_rejects_an_interpreted_prompt_injection() -> None:
    expect = CASES_BY_ID["en-prompt-injection"].expect

    assert check_refinement_case(expect, parsed(refinement_output())) == [
        "outcome: expected one of ['needs_clarification'], got interpreted"
    ]


def test_preflight_states_the_refinement_run_bounds() -> None:
    plan = EvalPlan(
        model="gpt-5.6-luna", dataset_version=DATASET_VERSION, cases=CASES, suite=REFINEMENT_SUITE
    )

    preflight = "\n".join(preflight_lines(plan))

    assert plan.request_budget == len(CASES) * MAX_OUTPUT_VALIDATION_ATTEMPTS
    assert "Paid real-model refinement eval" in preflight
    assert "refinement-v1" in preflight
    assert "refinement-eval-v1" in preflight
    assert all(case.request.refinement not in preflight for case in CASES)


@pytest.mark.anyio
async def test_fake_refinement_run_reports_failed_output_only_for_failed_cases() -> None:
    cases = [CASES_BY_ID["en-less-mainstream"], CASES_BY_ID["en-add-artist"]]
    plan = EvalPlan(model="fake", dataset_version="test", cases=cases, suite=REFINEMENT_SUITE)
    less_mainstream = refinement_output(
        patch=unchanged_patch(popularity={"operation": "set", "value": "rarities"})
    )
    provider = ScriptedModelProvider([{"outcome": "invalid"}, less_mainstream, less_mainstream])

    report = await run_eval(plan, provider)
    passed, failed = report["results"]  # type: ignore[misc]

    assert report["suite"] == "refinement"
    assert report["promptVersion"] == "refinement-v1"
    assert report["providerRequests"] == 3
    assert report["casesRequiringRetry"] == ["en-less-mainstream"]
    assert report["passed"] == 1
    assert passed["failed_output"] is None
    assert failed["failed_output"] == less_mainstream
    assert report["byExpectation"]["changed"] == {"passed": 1, "failed": 1, "unchecked": 0}


def test_the_refinement_suite_is_refused_without_explicit_paid_authorization(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    constructed: list[object] = []
    monkeypatch.setattr(
        run_intent_eval, "OpenAIIntentModelProvider", lambda **kwargs: constructed.append(kwargs)
    )
    monkeypatch.setattr(run_intent_eval, "ENV_FILE", Path("/nonexistent/.env"))

    with pytest.raises(SystemExit, match="paid operation"):
        main(["--suite", "refinement"], {"AI_PROVIDER": "openai", "AI_MODEL": "gpt-test"})

    assert constructed == []
