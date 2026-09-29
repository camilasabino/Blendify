import hashlib
import json
import re
from pathlib import Path
from typing import Any

import pytest

from app.interpretation.structured_model_call import MAX_OUTPUT_VALIDATION_ATTEMPTS
from app.models.intent import ClarificationReason, Mood, UnsupportedConstraintCategory
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
HISTORICAL_V1_DATASET_PATH = DATASET_PATH.parent / "refinement-eval-v1.json"
HISTORICAL_V1_DATASET_SHA256 = "05a16b4a7888c4d8a6e1a8b1da08d0d5e9542b78039f9560f066aa5457dccc17"
CASES_BY_ID = {case.id: case for case in CASES}
LOCAL_GENRE_ADDITIONS = ("es-add-genre-place", "en-add-genre-place", "pt-add-genre-place")
ARGENTINE_ROCK_ADDITION = {"genres": [["argentine rock"], ["rock argentino"]]}
V1_CASES_WITH_A_REQUIRED_CLARIFICATION_REASON = {
    "en-shorter-ambiguous": "ambiguous_request",
    "en-few-more-songs-ambiguous": "ambiguous_request",
    "en-percentage-popularity-ambiguous": "ambiguous_request",
    "es-longer-ambiguous": "ambiguous_request",
    "en-unsupported-activity": "unsupported_constraint",
    "en-unsupported-energy-progression": "unsupported_constraint",
    "en-per-artist-limit": "unsupported_constraint",
    "en-more-of-existing-seed": "unsupported_constraint",
    "en-keep-last-song": "unsupported_constraint",
    "en-rename-playlist": "unsupported_constraint",
    "es-unsupported-tempo": "unsupported_constraint",
    "pt-unsupported-artist-attribute": "unsupported_constraint",
    "en-prompt-injection": ["not_a_playlist_request", "unsupported_constraint"],
}
CATEGORIES = set(UnsupportedConstraintCategory.__args__)
PROVIDER_CONTENT_PATTERN = re.compile(r"spotify:|open\.spotify|https?://|\b[0-9A-Za-z]{22}\b")
REQUIRED_COVERAGE = {
    "en": [
        "en-add-genre-place",
        "en-add-genre-instrumental",
        "en-remove-genre",
        "en-remove-local-genre-named-in-english",
        "en-more-instrumental-characteristic",
        "en-more-of-existing-genre",
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
        "en-injection-schema-and-tools",
        "en-more-mainstream-from-balanced",
        "en-add-seed-track",
        "en-combination",
    ],
    "es": [
        "es-add-genre-place",
        "es-add-genre-instrumental",
        "es-remove-genre",
        "es-remove-local-genre",
        "es-artist-nationality-is-not-a-genre",
        "es-less-mainstream",
        "es-less-commercial-from-popular",
        "es-remove-seed-artist",
        "es-add-artist",
        "es-longer-ambiguous",
        "es-preserve-first-tracks",
        "es-unsupported-tempo",
        "es-combination",
        "es-more-mainstream-from-null",
        "es-percentage-popularity-ambiguous",
        "es-remove-seed-track",
        "es-exclude-track",
        "es-per-artist-limit",
        "es-injection-fake-assistant-text",
    ],
    "pt": [
        "pt-add-genre-place",
        "pt-add-genre-instrumental",
        "pt-remove-local-genre",
        "pt-less-popular",
        "pt-less-popular-from-popular",
        "pt-exclude-artist",
        "pt-preserve-first-tracks",
        "pt-unsupported-artist-attribute",
        "pt-combination",
        "pt-injection-secrets-and-contents",
    ],
}


def parsed(output: dict[str, object]) -> Any:
    return refinement_interpretation_adapter.validate_python(output)


def test_dataset_is_a_new_versioned_refinement_dataset_with_unique_ids() -> None:
    ids = [case.id for case in CASES]

    assert DATASET_VERSION == "refinement-eval-v2"
    assert DATASET_PATH.name == "refinement-eval-v2.json"
    assert len(ids) == len(set(ids))


def test_historical_v1_dataset_stays_frozen_and_inside_v2() -> None:
    digest = hashlib.sha256(HISTORICAL_V1_DATASET_PATH.read_bytes()).hexdigest()
    version, cases = load_dataset(HISTORICAL_V1_DATASET_PATH)

    assert digest == HISTORICAL_V1_DATASET_SHA256
    assert version == "refinement-eval-v1"
    for case in cases:
        current = CASES_BY_ID[case.id]
        reason = V1_CASES_WITH_A_REQUIRED_CLARIFICATION_REASON.get(case.id)
        if reason is None:
            assert current == case
            continue
        assert "clarificationReason" not in case.expect
        assert (current.language, current.request) == (case.language, case.request)
        assert current.expect == {**case.expect, "clarificationReason": reason}


def test_genre_refinements_expect_normalized_additions_and_literal_removals() -> None:
    for case_id in LOCAL_GENRE_ADDITIONS:
        assert "add" not in CASES_BY_ID[case_id].expect
        assert CASES_BY_ID[case_id].expect["addOneOf"] == ARGENTINE_ROCK_ADDITION
    for case_id in ("es-remove-genre", "en-remove-genre"):
        case = CASES_BY_ID[case_id]
        assert case.expect["remove"] == {"genres": ["indie rock"]}
        assert "indie rock" in case.request.intent.genres


def test_local_genre_removals_copy_the_current_intent_spelling() -> None:
    for case_id, genre in (
        ("es-remove-local-genre", "pop argentino"),
        ("pt-remove-local-genre", "mpb"),
    ):
        case = CASES_BY_ID[case_id]
        assert case.expect["remove"] == {"genres": [genre]}
        assert genre in case.request.intent.genres


def test_a_local_genre_named_in_english_may_be_removed_by_its_supported_alias() -> None:
    case = CASES_BY_ID["en-remove-local-genre-named-in-english"]

    assert "remove" not in case.expect
    assert case.expect["removeOneOf"] == {"genres": [["pop argentino"], ["argentine pop"]]}
    assert "pop argentino" in case.request.intent.genres
    for removed in (["pop argentino"], ["Argentine Pop"]):
        output = refinement_output(patch=unchanged_patch(genres={"add": [], "remove": removed}))
        assert check_refinement_case(case.expect, parsed(output)) == []
    other = refinement_output(patch=unchanged_patch(genres={"add": [], "remove": ["indie rock"]}))
    assert check_refinement_case(case.expect, parsed(other)) == [
        "removeOneOf: expected genres one of [['pop argentino'], ['argentine pop']], "
        "got ['indie rock']"
    ]


def genre_output(*, add: list[str], remove: list[str]) -> Any:
    return parsed(refinement_output(patch=unchanged_patch(genres={"add": add, "remove": remove})))


def test_only_add_expectations_offer_genre_alternatives_and_only_approved_equivalents() -> None:
    offered = {case.id: case.expect["addOneOf"] for case in CASES if "addOneOf" in case.expect}

    assert offered == dict.fromkeys(LOCAL_GENRE_ADDITIONS, ARGENTINE_ROCK_ADDITION)


@pytest.mark.parametrize("case_id", LOCAL_GENRE_ADDITIONS)
@pytest.mark.parametrize("added", [["argentine rock"], ["rock argentino"], ["Rock Argentino"]])
def test_accepts_either_approved_form_of_an_added_local_genre(
    case_id: str, added: list[str]
) -> None:
    expect = CASES_BY_ID[case_id].expect

    assert check_refinement_case(expect, genre_output(add=added, remove=[])) == []


@pytest.mark.parametrize(
    "added",
    [["rock"], ["rock nacional"], ["rock de argentina"], ["argentine rock", "rock"]],
)
def test_rejects_unrelated_or_extra_forms_of_an_added_local_genre(added: list[str]) -> None:
    expect = CASES_BY_ID["es-add-genre-place"].expect

    assert check_refinement_case(expect, genre_output(add=added, remove=[])) == [
        "addOneOf: expected genres one of [['argentine rock'], ['rock argentino']], "
        f"got {sorted(added)}"
    ]


def test_genre_alternatives_keep_additions_and_removals_distinct() -> None:
    add_expect = CASES_BY_ID["es-add-genre-place"].expect
    remove_expect = {
        "outcome": "interpreted",
        "changed": ["genres"],
        "removeOneOf": ARGENTINE_ROCK_ADDITION,
        "add": {"genres": []},
    }

    assert check_refinement_case(add_expect, genre_output(add=[], remove=["rock argentino"])) == [
        "addOneOf: expected genres one of [['argentine rock'], ['rock argentino']], got []",
        "remove: expected genres [], got ['rock argentino']",
    ]
    assert (
        check_refinement_case(remove_expect, genre_output(add=[], remove=["rock argentino"])) == []
    )
    assert check_refinement_case(
        remove_expect, genre_output(add=["rock argentino"], remove=[])
    ) == [
        "add: expected genres [], got ['rock argentino']",
        "removeOneOf: expected genres one of [['argentine rock'], ['rock argentino']], got []",
    ]


def test_relative_characteristics_never_expect_a_genre_change() -> None:
    for case_id in ("en-more-instrumental-characteristic", "en-more-of-existing-genre"):
        expect = CASES_BY_ID[case_id].expect
        assert expect["changedWithin"] == []
        assert expect["unsupportedCategories"] == ["other"]
    nationality = CASES_BY_ID["es-artist-nationality-is-not-a-genre"].expect
    assert nationality["unsupportedCategories"] == ["artist_attribute"]


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
        *expect.get("addOneOf", {}),
        *expect.get("remove", {}),
        *expect.get("removeOneOf", {}),
    ]
    categories = expect.get("unsupportedCategories", []) + expect.get(
        "unsupportedCategoriesWithin", []
    )

    assert set(expect) <= EXPECTATION_KEYS
    assert set(outcomes) <= {"interpreted", "needs_clarification"}
    assert set(paths) <= PATCH_PATHS
    assert set(categories) <= CATEGORIES
    assert set(as_list(expect.get("clarificationReason", []))) <= set(ClarificationReason.__args__)
    if "mood" in expect.get("set", {}):
        assert expect["set"]["mood"] in Mood.__args__


def as_list(value: object) -> list[object]:
    return value if isinstance(value, list) else [value]


def test_relative_changes_without_an_amount_never_expect_a_number() -> None:
    for case_id in (
        "en-shorter-ambiguous",
        "en-few-more-songs-ambiguous",
        "en-percentage-popularity-ambiguous",
        "es-longer-ambiguous",
        "es-percentage-popularity-ambiguous",
    ):
        expect = CASES_BY_ID[case_id].expect
        assert expect["changedWithin"] == []
        assert expect["clarificationReason"] == "ambiguous_request"
        assert "set" not in expect


@pytest.mark.parametrize("case", CASES, ids=lambda case: case.id)
def test_every_case_that_accepts_a_clarification_states_its_reason(case: Any) -> None:
    if "needs_clarification" in as_list(case.expect["outcome"]):
        assert case.expect.get("clarificationReason")


INJECTION_CASES = {
    "en": [
        "en-prompt-injection",
        "en-prompt-injection-next-to-a-change",
        "en-injection-schema-and-tools",
    ],
    "es": ["es-injection-fake-assistant-text"],
    "pt": ["pt-injection-secrets-and-contents"],
}


@pytest.mark.parametrize("language", sorted(INJECTION_CASES))
def test_dataset_covers_prompt_injection_in_each_language(language: str) -> None:
    for case_id in INJECTION_CASES[language]:
        case = CASES_BY_ID[case_id]
        assert case.language == language
        assert set(as_list(case.expect["outcome"])) <= {"interpreted", "needs_clarification"}


POPULARITY_LESS_MAINSTREAM = {"popular": "balanced", "balanced": "rarities", "rarities": "rarities"}
POPULARITY_MORE_MAINSTREAM = {"rarities": "balanced", "balanced": "popular", "popular": "popular"}
POPULARITY_STEP_CASES = {
    "en-less-mainstream": POPULARITY_LESS_MAINSTREAM,
    "en-less-mainstream-from-popular": POPULARITY_LESS_MAINSTREAM,
    "en-less-mainstream-from-balanced": POPULARITY_LESS_MAINSTREAM,
    "en-already-satisfied": POPULARITY_LESS_MAINSTREAM,
    "en-more-mainstream-from-rarities": POPULARITY_MORE_MAINSTREAM,
    "en-more-mainstream-already-popular": POPULARITY_MORE_MAINSTREAM,
    "en-more-mainstream-from-balanced": POPULARITY_MORE_MAINSTREAM,
    "es-more-mainstream-from-null": POPULARITY_MORE_MAINSTREAM,
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
    assert "refinement-v2" in preflight
    assert "refinement-eval-v2" in preflight
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
    assert report["promptVersion"] == "refinement-v2"
    assert report["modelRequests"] == 3
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


def test_popularity_steps_cover_every_mode_and_a_null_current_mode_in_both_directions() -> None:
    covered = {
        (CASES_BY_ID[case_id].request.intent.popularity, steps is POPULARITY_LESS_MAINSTREAM)
        for case_id, steps in POPULARITY_STEP_CASES.items()
    }

    for less_mainstream in (True, False):
        for current in (None, "popular", "balanced", "rarities"):
            assert (current, less_mainstream) in covered


def test_rejects_an_output_that_leaks_an_identifier() -> None:
    expect = CASES_BY_ID["en-add-artist"].expect
    leaked = refinement_output(
        patch=unchanged_patch(
            artists={"add": ["spotify:artist:6olE6TJLqED3rqDCT0FyPh"], "remove": []}
        )
    )

    failures = check_refinement_case(expect, parsed(leaked))

    assert failures[0].startswith("identifiers: output contains identifiers, URIs or URLs")


def test_accepts_any_listed_clarification_reason_and_rejects_others() -> None:
    expect = CASES_BY_ID["en-prompt-injection"].expect

    for reason in ("not_a_playlist_request", "unsupported_constraint"):
        assert check_refinement_case(expect, parsed(refinement_clarification(reason))) == []
    assert check_refinement_case(expect, parsed(refinement_clarification("ambiguous_request"))) == [
        "clarificationReason: expected one of ['not_a_playlist_request', "
        "'unsupported_constraint'], got ambiguous_request"
    ]


def test_rejects_a_clarification_with_the_wrong_reason_for_a_relative_change() -> None:
    expect = CASES_BY_ID["en-shorter-ambiguous"].expect
    unsupported = refinement_clarification(
        "not_a_playlist_request", [{"category": "duration", "userText": "shorter"}]
    )

    assert check_refinement_case(expect, parsed(unsupported)) == [
        "clarificationReason: expected one of ['ambiguous_request'], got not_a_playlist_request"
    ]


def test_compares_unsupported_categories_as_a_set() -> None:
    expect = CASES_BY_ID["en-per-artist-limit"].expect
    twice = refinement_output(
        unsupported=[
            {"category": "other", "userText": "no more than two"},
            {"category": "other", "userText": "songs per artist"},
        ]
    )
    wrong = refinement_output(unsupported=[{"category": "era", "userText": "per artist"}])

    assert check_refinement_case(expect, parsed(twice)) == []
    assert check_refinement_case(expect, parsed(wrong)) == [
        "unsupportedCategories: expected ['other'], got ['era']"
    ]
