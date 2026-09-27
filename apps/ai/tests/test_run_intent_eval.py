from pathlib import Path

import pytest

from app.interpretation.intent_interpreter import MAX_OUTPUT_VALIDATION_ATTEMPTS
from app.providers.model_provider import ModelConfigurationError, ModelInvalidOutputError
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
from tests.fakes import FAKE_USAGE, ScriptedModelProvider, interpreted_output

API_KEY = "sk-test-key-that-must-never-be-printed"
AUTHORIZED_ENV = {
    "AI_PROVIDER": "openai",
    "AI_MODEL": "gpt-test-model",
    "OPENAI_API_KEY": API_KEY,
    "ALLOW_PAID_AI_EVALS": "true",
}
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

    monkeypatch.setattr(run_intent_eval, "OpenAIIntentModelProvider", refuse)
    monkeypatch.setattr(run_intent_eval, "ENV_FILE", Path("/nonexistent/.env"))
    return constructed


@pytest.mark.parametrize(
    ("environ", "argv", "missing"),
    [
        (
            {key: value for key, value in AUTHORIZED_ENV.items() if key != "OPENAI_API_KEY"},
            ["--confirm"],
            "OPENAI_API_KEY",
        ),
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
            "AI_PROVIDER=openai",
        ),
        ({**AUTHORIZED_ENV, "AI_PROVIDER": "disabled"}, ["--confirm"], "AI_PROVIDER=openai"),
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

    assert (
        "Missing: OPENAI_API_KEY, AI_PROVIDER=openai, AI_MODEL, ALLOW_PAID_AI_EVALS=true, --confirm"
        in str(exit_info.value)
    )
    assert forbid_provider == []


def test_refuses_an_opt_in_persisted_in_the_env_file(
    forbid_provider: list[object], monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("AI_PROVIDER=openai\nexport ALLOW_PAID_AI_EVALS=true\n")
    monkeypatch.setattr(run_intent_eval, "ENV_FILE", env_file)

    with pytest.raises(SystemExit, match="only on the command line"):
        main(["--confirm"], AUTHORIZED_ENV)

    assert forbid_provider == []


def test_preflight_uses_exactly_the_configured_model(
    forbid_provider: list[object], monkeypatch: pytest.MonkeyPatch
) -> None:
    built: list[dict[str, object]] = []
    monkeypatch.setattr(
        run_intent_eval, "OpenAIIntentModelProvider", lambda **kwargs: built.append(kwargs)
    )

    async def skip_run(plan: EvalPlan, provider: object) -> None:
        raise SystemExit(f"planned {plan.model}")

    monkeypatch.setattr(run_intent_eval, "run_eval", skip_run)

    with pytest.raises(SystemExit, match="planned gpt-test-model"):
        main(["--confirm"], AUTHORIZED_ENV)

    assert [call["model"] for call in built] == ["gpt-test-model"]


def test_refuses_unknown_case_ids(forbid_provider: list[object]) -> None:
    with pytest.raises(SystemExit, match="Unknown eval case ids: missing-case"):
        main(["--confirm", "--case", "missing-case"], AUTHORIZED_ENV)

    assert forbid_provider == []


def test_preflight_states_the_run_bounds_without_secrets_or_prompts() -> None:
    dataset_version, cases = load_dataset()
    plan = EvalPlan(model="gpt-5.6-luna", dataset_version=dataset_version, cases=cases)

    preflight = "\n".join(preflight_lines(plan))

    assert plan.request_budget == len(cases) * MAX_OUTPUT_VALIDATION_ATTEMPTS
    assert f"max provider requests:    {plan.request_budget}" in preflight
    assert "gpt-5.6-luna" in preflight
    assert "intent-eval-v3" in preflight
    assert "intent-v3" in preflight
    assert "explicitly enabled" in preflight
    assert API_KEY not in preflight
    assert all(case.prompt not in preflight for case in cases)


@pytest.mark.anyio
async def test_metered_provider_counts_failed_requests_and_enforces_the_budget() -> None:
    scripted = ScriptedModelProvider([ModelInvalidOutputError("bad"), interpreted_output()])
    metered = MeteredModelProvider(scripted, request_budget=2)
    request = object()

    with pytest.raises(ModelInvalidOutputError):
        await metered.generate_intent(request)  # type: ignore[arg-type]
    await metered.generate_intent(request)  # type: ignore[arg-type]
    with pytest.raises(ProviderRequestBudgetExceededError):
        await metered.generate_intent(request)  # type: ignore[arg-type]

    assert metered.request_count == 2
    assert len(scripted.requests) == 2
    assert [record.usage for record in metered.records] == [None, FAKE_USAGE]


@pytest.mark.anyio
async def test_run_accounts_for_requests_retries_and_tokens() -> None:
    plan = EvalPlan(model="fake", dataset_version="test", cases=[MATCHING_CASE, MISMATCHING_CASE])
    provider = ScriptedModelProvider(
        [{"outcome": "invalid"}, interpreted_output(), interpreted_output()]
    )

    report = await run_eval(plan, provider)

    assert report["providerRequests"] == 3
    assert report["providerRequestBudget"] == 2 * MAX_OUTPUT_VALIDATION_ATTEMPTS
    assert report["casesRequiringRetry"] == ["matching"]
    assert report["passed"] == 1
    assert report["inputTokens"] == 3 * FAKE_USAGE.input_tokens
    assert report["outputTokens"] == 3 * FAKE_USAGE.output_tokens
    assert report["aborted"] is None
    assert report["byLanguage"] == {
        "en": {"passed": 1, "cases": 1},
        "es": {"passed": 0, "cases": 1},
    }
    assert report["byExpectation"]["artists"] == {"passed": 1, "failed": 1, "unchecked": 0}


@pytest.mark.anyio
async def test_run_never_exceeds_the_attempt_bound_per_case() -> None:
    plan = EvalPlan(model="fake", dataset_version="test", cases=[MATCHING_CASE, MISMATCHING_CASE])
    provider = ScriptedModelProvider([{"outcome": "invalid"}] * 4)

    report = await run_eval(plan, provider)

    assert report["providerRequests"] == plan.request_budget
    assert report["passed"] == 0
    assert [result["error"] for result in report["results"]] == [  # type: ignore[index]
        "INVALID_MODEL_OUTPUT",
        "INVALID_MODEL_OUTPUT",
    ]


@pytest.mark.anyio
async def test_run_stops_at_the_first_provider_configuration_failure() -> None:
    plan = EvalPlan(model="fake", dataset_version="test", cases=[MATCHING_CASE, MISMATCHING_CASE])
    provider = ScriptedModelProvider([ModelConfigurationError("invalid key")])

    report = await run_eval(plan, provider)

    assert report["providerRequests"] == 1
    assert report["cases"] == 1
    assert report["aborted"] == "Provider error MODEL_UNAVAILABLE on case matching"


def test_expectation_statuses_distinguish_failed_and_unchecked_keys() -> None:
    expect = {"outcome": "interpreted", "artists": ["A"], "kind": "artist_mix"}

    assert expectation_statuses(expect, ["artists: expected ['a'], got []"]) == {
        "outcome": "passed",
        "artists": "failed",
        "kind": "passed",
    }
    assert expectation_statuses(expect, ["outcome: expected interpreted, got x"]) == {
        "outcome": "failed",
        "artists": "unchecked",
        "kind": "unchecked",
    }
    assert set(expectation_statuses(expect, None).values()) == {"unchecked"}
    assert tally_expectations([{"kind": "passed"}, {"kind": "failed"}]) == {
        "kind": {"passed": 1, "failed": 1, "unchecked": 0}
    }
