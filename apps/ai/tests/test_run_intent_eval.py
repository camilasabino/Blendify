from pathlib import Path

import pytest

from app.config.settings import Settings
from app.interpretation.structured_model_call import MAX_OUTPUT_VALIDATION_ATTEMPTS
from app.providers.model_provider import (
    ModelConfigurationError,
    ModelInvalidOutputError,
    ModelRateLimitedError,
)
from evals import run_intent_eval
from evals.intent_eval import EvalCase, expectation_statuses, load_dataset, tally_expectations
from evals.metered_provider import MeteredModelProvider, ProviderRequestBudgetExceededError
from evals.run_intent_eval import (
    PAID_EVAL_COMMAND,
    EvalPlan,
    main,
    preflight_lines,
    run_eval,
)
from tests.fakes import (
    FAKE_MODEL,
    FAKE_PROVIDER,
    FAKE_USAGE,
    ScriptedModelProvider,
    interpreted_output,
)

API_KEY = "sk-test-key-that-must-never-be-printed"
AUTHORIZED_ENV = {
    "AI_PROVIDER": FAKE_PROVIDER,
    "AI_MODEL": "test-model",
    "AI_PROVIDER_API_KEY": API_KEY,
    "ALLOW_PAID_AI_EVALS": "true",
}
PROVIDER_REQUIREMENT = "AI_PROVIDER (a model provider, not disabled)"
MATCHING_CASE = EvalCase(
    id="matching",
    language="en",
    prompt="30 deep cuts from Radiohead and Interpol, no Coldplay",
    expect={
        "outcome": "interpreted",
        "artists": ["Radiohead", "Interpol"],
        "popularity": "rarities",
    },
)
MISMATCHING_CASE = EvalCase(
    id="mismatching",
    language="es",
    prompt="Una mezcla de Soda Stereo",
    expect={"outcome": "interpreted", "artists": ["Soda Stereo"], "popularity": "rarities"},
)


@pytest.fixture
def forbid_provider(monkeypatch: pytest.MonkeyPatch) -> list[object]:
    constructed: list[object] = []

    def refuse(*args: object, **kwargs: object) -> None:
        constructed.append((args, kwargs))
        raise AssertionError("the eval built a real provider before authorization")

    monkeypatch.setattr(run_intent_eval, "build_model_provider", refuse)
    monkeypatch.setattr(run_intent_eval, "ENV_FILE", Path("/nonexistent/.env"))
    return constructed


@pytest.mark.parametrize(
    ("environ", "argv", "missing"),
    [
        (
            {key: value for key, value in AUTHORIZED_ENV.items() if key != "ALLOW_PAID_AI_EVALS"},
            ["--confirm"],
            "ALLOW_PAID_AI_EVALS=true",
        ),
        ({**AUTHORIZED_ENV, "ALLOW_PAID_AI_EVALS": "1"}, ["--confirm"], "ALLOW_PAID_AI_EVALS=true"),
        (AUTHORIZED_ENV, [], "--confirm"),
        (
            {key: value for key, value in AUTHORIZED_ENV.items() if key != "AI_PROVIDER"},
            ["--confirm"],
            PROVIDER_REQUIREMENT,
        ),
        ({**AUTHORIZED_ENV, "AI_PROVIDER": "disabled"}, ["--confirm"], PROVIDER_REQUIREMENT),
        ({**AUTHORIZED_ENV, "AI_MODEL": " "}, ["--confirm"], "AI_MODEL"),
    ],
)
def test_refuses_before_any_provider_request_when_a_requirement_is_missing(
    forbid_provider: list[object],
    environ: dict[str, str],
    argv: list[str],
    missing: str,
    capsys: pytest.CaptureFixture[str],
) -> None:
    with pytest.raises(SystemExit) as exit_info:
        main(argv, environ)

    message = str(exit_info.value)
    assert "paid operation" in message
    assert f"Missing: {missing}" in message
    assert PAID_EVAL_COMMAND in message
    assert forbid_provider == []
    assert capsys.readouterr().out == ""


def test_lists_every_missing_requirement(forbid_provider: list[object]) -> None:
    with pytest.raises(SystemExit) as exit_info:
        main([], {})

    assert f"Missing: {PROVIDER_REQUIREMENT}, AI_MODEL, ALLOW_PAID_AI_EVALS=true, --confirm" in str(
        exit_info.value
    )
    assert forbid_provider == []


def test_refuses_an_opt_in_persisted_in_the_env_file(
    forbid_provider: list[object], monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(f"AI_PROVIDER={FAKE_PROVIDER}\nexport ALLOW_PAID_AI_EVALS=true\n")
    monkeypatch.setattr(run_intent_eval, "ENV_FILE", env_file)

    with pytest.raises(SystemExit, match="only on the command line"):
        main(["--confirm"], AUTHORIZED_ENV)

    assert forbid_provider == []


def test_preflight_uses_exactly_the_configured_model(
    forbid_provider: list[object], monkeypatch: pytest.MonkeyPatch
) -> None:
    built: list[Settings] = []

    def record(settings: Settings, timeout_seconds: float) -> ScriptedModelProvider:
        built.append(settings)
        return ScriptedModelProvider([])

    monkeypatch.setattr(run_intent_eval, "build_model_provider", record)

    async def skip_run(plan: EvalPlan, provider: object) -> None:
        raise SystemExit(f"planned {plan.model}")

    monkeypatch.setattr(run_intent_eval, "run_eval", skip_run)

    with pytest.raises(SystemExit, match="planned test-model"):
        main(["--confirm"], AUTHORIZED_ENV)

    assert [(call.model_provider, call.model) for call in built] == [(FAKE_PROVIDER, "test-model")]


def test_refuses_unknown_case_ids(forbid_provider: list[object]) -> None:
    with pytest.raises(SystemExit, match="Unknown eval case ids: missing-case"):
        main(["--confirm", "--case", "missing-case"], AUTHORIZED_ENV)

    assert forbid_provider == []


def test_preflight_states_the_run_bounds_without_secrets_or_prompts() -> None:
    dataset_version, cases = load_dataset()
    plan = EvalPlan(model="test-model", dataset_version=dataset_version, cases=cases)

    preflight = "\n".join(preflight_lines(plan, FAKE_PROVIDER))

    assert plan.request_budget == len(cases) * MAX_OUTPUT_VALIDATION_ATTEMPTS
    assert f"max model requests:       {plan.request_budget}" in preflight
    assert f"provider:                 {FAKE_PROVIDER}" in preflight
    assert "model:                    test-model" in preflight
    assert "intent-eval-v6" in preflight
    assert "intent-v6" in preflight
    assert "explicitly enabled" in preflight
    assert API_KEY not in preflight
    assert all(case.prompt not in preflight for case in cases)


@pytest.mark.anyio
async def test_metered_provider_counts_failed_requests_and_enforces_the_budget() -> None:
    scripted = ScriptedModelProvider(
        [
            ModelInvalidOutputError("bad", model=FAKE_MODEL, usage=FAKE_USAGE),
            ModelInvalidOutputError("bad"),
            interpreted_output(),
        ]
    )
    metered = MeteredModelProvider(scripted, request_budget=3)
    request = object()

    for _ in range(2):
        with pytest.raises(ModelInvalidOutputError):
            await metered.generate_intent(request)  # type: ignore[arg-type]
    await metered.generate_intent(request)  # type: ignore[arg-type]
    with pytest.raises(ProviderRequestBudgetExceededError):
        await metered.generate_intent(request)  # type: ignore[arg-type]

    assert metered.request_count == 3
    assert len(scripted.requests) == 3
    assert [record.usage for record in metered.records] == [FAKE_USAGE, None, FAKE_USAGE]
    assert [record.model for record in metered.records] == [FAKE_MODEL, None, FAKE_MODEL]


def usage_of(report: dict[str, object]) -> tuple[object, ...]:
    return (
        report["modelRequests"],
        report["inputTokens"],
        report["outputTokens"],
        report["totalTokens"],
        report["usageComplete"],
    )


@pytest.mark.anyio
async def test_run_accounts_for_a_first_attempt_success() -> None:
    plan = EvalPlan(model="fake", dataset_version="test", cases=[MATCHING_CASE])

    report = await run_eval(plan, ScriptedModelProvider([interpreted_output()]))

    assert usage_of(report) == (
        1,
        FAKE_USAGE.input_tokens,
        FAKE_USAGE.output_tokens,
        FAKE_USAGE.total_tokens,
        True,
    )
    assert report["casesRequiringRetry"] == []
    assert report["retryRequests"] == 0
    assert report["responseModels"] == [FAKE_MODEL]


@pytest.mark.parametrize(
    "invalid_output",
    [{"outcome": "invalid"}, ModelInvalidOutputError("bad", model=FAKE_MODEL, usage=FAKE_USAGE)],
    ids=["schema-invalid", "provider-invalid"],
)
@pytest.mark.anyio
async def test_run_counts_the_usage_of_an_invalid_output_followed_by_a_success(
    invalid_output: object,
) -> None:
    plan = EvalPlan(model="fake", dataset_version="test", cases=[MATCHING_CASE])
    provider = ScriptedModelProvider([invalid_output, interpreted_output()])  # type: ignore[list-item]

    report = await run_eval(plan, provider)
    (result,) = report["results"]  # type: ignore[misc]

    assert report["cases"] == 1
    assert report["passed"] == 1
    assert usage_of(report) == (
        2,
        2 * FAKE_USAGE.input_tokens,
        2 * FAKE_USAGE.output_tokens,
        2 * FAKE_USAGE.total_tokens,
        True,
    )
    assert report["casesRequiringRetry"] == ["matching"]
    assert report["retryRequests"] == 1
    assert result["model_requests"] == 2
    assert result["total_tokens"] == 2 * FAKE_USAGE.total_tokens


@pytest.mark.anyio
async def test_run_counts_the_usage_of_two_invalid_outputs() -> None:
    plan = EvalPlan(model="fake", dataset_version="test", cases=[MATCHING_CASE])
    provider = ScriptedModelProvider(
        [
            ModelInvalidOutputError("bad", model=FAKE_MODEL, usage=FAKE_USAGE),
            {"outcome": "invalid"},
        ]
    )

    report = await run_eval(plan, provider)

    assert report["cases"] == 1
    assert report["passed"] == 0
    assert report["failedCaseIds"] == ["matching"]
    assert report["erroredCaseIds"] == ["matching"]
    assert usage_of(report) == (
        2,
        2 * FAKE_USAGE.input_tokens,
        2 * FAKE_USAGE.output_tokens,
        2 * FAKE_USAGE.total_tokens,
        True,
    )
    assert report["results"][0]["error"] == "INVALID_MODEL_OUTPUT"  # type: ignore[index]


@pytest.mark.anyio
async def test_run_reports_incomplete_usage_without_estimating_it() -> None:
    plan = EvalPlan(model="fake", dataset_version="test", cases=[MATCHING_CASE])
    provider = ScriptedModelProvider([ModelInvalidOutputError("bad"), interpreted_output()])

    report = await run_eval(plan, provider)
    (result,) = report["results"]  # type: ignore[misc]

    assert usage_of(report) == (
        2,
        FAKE_USAGE.input_tokens,
        FAKE_USAGE.output_tokens,
        FAKE_USAGE.total_tokens,
        False,
    )
    assert result["usage_complete"] is False


@pytest.mark.anyio
async def test_run_reports_missing_usage_as_incomplete_and_zero() -> None:
    plan = EvalPlan(model="fake", dataset_version="test", cases=[MATCHING_CASE])

    report = await run_eval(plan, ScriptedModelProvider([interpreted_output()], usage=None))

    assert usage_of(report) == (1, 0, 0, 0, False)


@pytest.mark.anyio
async def test_run_counts_a_provider_failure_as_a_request_with_unknown_usage() -> None:
    plan = EvalPlan(model="fake", dataset_version="test", cases=[MATCHING_CASE, MISMATCHING_CASE])
    provider = ScriptedModelProvider([ModelRateLimitedError("slow down")])

    report = await run_eval(plan, provider)

    assert usage_of(report) == (1, 0, 0, 0, False)
    assert report["cases"] == 1
    assert report["erroredCaseIds"] == ["matching"]
    assert report["aborted"] == "Provider error MODEL_RATE_LIMITED on case matching"


@pytest.mark.anyio
async def test_run_accounts_for_requests_retries_and_tokens() -> None:
    plan = EvalPlan(model="fake", dataset_version="test", cases=[MATCHING_CASE, MISMATCHING_CASE])
    provider = ScriptedModelProvider(
        [{"outcome": "invalid"}, interpreted_output(), interpreted_output()]
    )

    report = await run_eval(plan, provider)

    assert report["modelRequests"] == 3
    assert report["modelRequestBudget"] == 2 * MAX_OUTPUT_VALIDATION_ATTEMPTS
    assert report["casesRequiringRetry"] == ["matching"]
    assert report["cases"] == 2
    assert report["passed"] == 1
    assert report["failed"] == 1
    assert report["passRate"] == 0.5
    assert report["failedCaseIds"] == ["mismatching"]
    assert report["erroredCaseIds"] == []
    assert report["inputTokens"] == 3 * FAKE_USAGE.input_tokens
    assert report["outputTokens"] == 3 * FAKE_USAGE.output_tokens
    assert report["totalTokens"] == 3 * FAKE_USAGE.total_tokens
    assert report["usageComplete"] is True
    assert report["aborted"] is None
    assert report["byLanguage"] == {
        "en": {"passed": 1, "cases": 1},
        "es": {"passed": 0, "cases": 1},
    }
    assert report["byExpectation"]["artists"] == {"passed": 1, "failed": 1, "unchecked": 0}


@pytest.mark.anyio
async def test_run_keeps_the_normalized_output_only_for_failed_cases() -> None:
    plan = EvalPlan(model="fake", dataset_version="test", cases=[MATCHING_CASE, MISMATCHING_CASE])
    provider = ScriptedModelProvider([interpreted_output(), interpreted_output()])

    report = await run_eval(plan, provider)
    matching, mismatching = report["results"]  # type: ignore[misc]

    assert matching["failed_output"] is None
    assert mismatching["failed_output"] == interpreted_output()


@pytest.mark.anyio
async def test_run_never_exceeds_the_attempt_bound_per_case() -> None:
    plan = EvalPlan(model="fake", dataset_version="test", cases=[MATCHING_CASE, MISMATCHING_CASE])
    provider = ScriptedModelProvider([{"outcome": "invalid"}] * 4)

    report = await run_eval(plan, provider)

    assert report["modelRequests"] == plan.request_budget
    assert report["passed"] == 0
    assert [result["error"] for result in report["results"]] == [  # type: ignore[index]
        "INVALID_MODEL_OUTPUT",
        "INVALID_MODEL_OUTPUT",
    ]


@pytest.mark.anyio
async def test_run_stops_at_the_first_provider_configuration_failure() -> None:
    plan = EvalPlan(model="fake", dataset_version="test", cases=[MATCHING_CASE, MISMATCHING_CASE])
    provider = ScriptedModelProvider([ModelConfigurationError("authentication")])

    report = await run_eval(plan, provider)

    assert report["modelRequests"] == 1
    assert report["cases"] == 1
    assert report["aborted"] == "Provider error MODEL_UNAVAILABLE on case matching"


def test_expectation_statuses_distinguish_failed_and_unchecked_keys() -> None:
    expect = {"outcome": "interpreted", "artists": ["A"], "kind": "artist_mix"}

    assert expectation_statuses(expect, ["artists: expected ['a'], got []"]) == {
        "outcome": "passed",
        "artists": "failed",
        "kind": "passed",
        "identifiers": "passed",
    }
    assert expectation_statuses(
        expect, ["identifiers: output contains", "outcome: expected interpreted, got x"]
    ) == {
        "outcome": "failed",
        "artists": "unchecked",
        "kind": "unchecked",
        "identifiers": "failed",
    }
    assert set(expectation_statuses(expect, None).values()) == {"unchecked"}
    assert tally_expectations([{"kind": "passed"}, {"kind": "failed"}]) == {
        "kind": {"passed": 1, "failed": 1, "unchecked": 0}
    }


@pytest.mark.anyio
async def test_report_records_reproducibility_metadata_without_secrets() -> None:
    plan = EvalPlan(model="test-model", dataset_version="test", cases=[MATCHING_CASE])

    report = await run_eval(plan, ScriptedModelProvider([interpreted_output()]))

    assert report["promptVersion"] == "intent-v6"
    assert len(report["promptSha256"]) == 64  # type: ignore[arg-type]
    assert len(report["datasetSha256"]) == 64  # type: ignore[arg-type]
    assert report["caseFilter"] is None
    assert report["provider"] == FAKE_PROVIDER
    assert report["model"] == "test-model"
    assert report["responseModels"] == [FAKE_MODEL]
    assert report["modelSettings"] == {
        "maxModelRequestsPerCase": MAX_OUTPUT_VALIDATION_ATTEMPTS,
        "modelCallTimeoutSeconds": 12.0,
    }
    assert API_KEY not in str(report)


def test_refuses_an_abbreviated_confirmation_flag(forbid_provider: list[object]) -> None:
    with pytest.raises(SystemExit):
        main(["--conf"], AUTHORIZED_ENV)

    assert forbid_provider == []
