import argparse
import asyncio
import hashlib
import json
import os
import re
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.config.settings import InvalidSettingsError, Settings, load_settings
from app.errors import AiServiceError
from app.interpretation.intent_interpreter import IntentInterpreter
from app.interpretation.refinement_planner import RefinementPlanner
from app.interpretation.structured_model_call import (
    MAX_OUTPUT_VALIDATION_ATTEMPTS,
    MODEL_CALL_TIMEOUT_SECONDS,
)
from app.models.interpretation import InterpretIntentRequest
from app.prompts.intent import INTENT_PROMPT_VERSION, INTENT_SYSTEM_PROMPT
from app.prompts.refinement import REFINEMENT_PROMPT_VERSION, REFINEMENT_SYSTEM_PROMPT
from app.providers.disabled import DISABLED_PROVIDER_NAME
from app.providers.model_provider import IntentModelProvider, ModelProviderSetupError
from app.providers.registry import build_model_provider
from evals import intent_eval, refinement_eval
from evals.intent_eval import (
    EvalCase,
    ExpectationStatus,
    check_case,
    expectation_statuses,
    tally_expectations,
)
from evals.metered_provider import (
    MeteredModelProvider,
    ProviderRequestBudgetExceededError,
    ProviderRequestRecord,
)
from evals.refinement_eval import RefinementEvalCase, check_refinement_case

APP_ROOT = Path(__file__).resolve().parent.parent
RESULTS_DIR = APP_ROOT / "evals" / "results"
ENV_FILE = APP_ROOT / ".env"

PAID_EVAL_OPT_IN_VARIABLE = "ALLOW_PAID_AI_EVALS"
PAID_EVAL_OPT_IN_VALUE = "true"
PAID_EVAL_COMMAND = f"{PAID_EVAL_OPT_IN_VARIABLE}=true npm run eval:ai -- --confirm"
MAX_PROVIDER_REQUESTS_PER_CASE = MAX_OUTPUT_VALIDATION_ATTEMPTS
RUN_ABORTING_ERRORS = frozenset({"MODEL_UNAVAILABLE", "MODEL_RATE_LIMITED"})
PERSISTED_OPT_IN_PATTERN = re.compile(rf"^\s*(export\s+)?{PAID_EVAL_OPT_IN_VARIABLE}\s*=")


class EvalPreflightError(Exception):
    pass


AnyEvalCase = EvalCase | RefinementEvalCase
CaseOutcome = tuple[list[str], dict[str, Any]]
CaseEvaluator = Callable[[IntentModelProvider, Any], Awaitable[CaseOutcome]]


@dataclass(frozen=True, slots=True)
class EvalSuite:
    name: str
    prompt_version: str
    system_prompt: str
    dataset_path: Path
    load_dataset: Callable[[Path], tuple[str, Sequence[AnyEvalCase]]]
    evaluate: CaseEvaluator


async def _evaluate_intent_case(provider: IntentModelProvider, case: EvalCase) -> CaseOutcome:
    interpreter = IntentInterpreter(
        provider, max_output_validation_attempts=MAX_PROVIDER_REQUESTS_PER_CASE
    )
    response = await interpreter.interpret(
        InterpretIntentRequest.model_validate({"prompt": case.prompt})
    )
    return check_case(case.expect, response.result), response.result.model_dump(
        mode="json", by_alias=True
    )


async def _evaluate_refinement_case(
    provider: IntentModelProvider, case: RefinementEvalCase
) -> CaseOutcome:
    planner = RefinementPlanner(
        provider, max_output_validation_attempts=MAX_PROVIDER_REQUESTS_PER_CASE
    )
    response = await planner.plan(case.request)
    return check_refinement_case(case.expect, response.result), response.result.model_dump(
        mode="json", by_alias=True
    )


INTENT_SUITE = EvalSuite(
    name="intent",
    prompt_version=INTENT_PROMPT_VERSION,
    system_prompt=INTENT_SYSTEM_PROMPT,
    dataset_path=intent_eval.DATASET_PATH,
    load_dataset=intent_eval.load_dataset,
    evaluate=_evaluate_intent_case,
)
REFINEMENT_SUITE = EvalSuite(
    name="refinement",
    prompt_version=REFINEMENT_PROMPT_VERSION,
    system_prompt=REFINEMENT_SYSTEM_PROMPT,
    dataset_path=refinement_eval.DATASET_PATH,
    load_dataset=refinement_eval.load_dataset,
    evaluate=_evaluate_refinement_case,
)
EVAL_SUITES = {suite.name: suite for suite in (INTENT_SUITE, REFINEMENT_SUITE)}


@dataclass(frozen=True, slots=True)
class CaseResult:
    id: str
    language: str
    passed: bool
    failures: list[str]
    expectations: dict[str, ExpectationStatus]
    error: str | None
    model_requests: int
    model_latency_ms: int
    input_tokens: int
    output_tokens: int
    total_tokens: int
    usage_complete: bool
    failed_output: dict[str, Any] | None


@dataclass(frozen=True, slots=True)
class EvalPlan:
    model: str
    dataset_version: str
    cases: Sequence[AnyEvalCase]
    suite: EvalSuite = field(default=INTENT_SUITE)
    case_filter: tuple[str, ...] = ()

    @property
    def request_budget(self) -> int:
        return len(self.cases) * MAX_PROVIDER_REQUESTS_PER_CASE


def missing_paid_eval_requirements(environ: Mapping[str, str], *, confirmed: bool) -> list[str]:
    missing: list[str] = []
    if environ.get("AI_PROVIDER", "").strip() in ("", DISABLED_PROVIDER_NAME):
        missing.append("AI_PROVIDER (a model provider, not disabled)")
    if not environ.get("AI_MODEL", "").strip():
        missing.append("AI_MODEL")
    if environ.get(PAID_EVAL_OPT_IN_VARIABLE, "").strip() != PAID_EVAL_OPT_IN_VALUE:
        missing.append(f"{PAID_EVAL_OPT_IN_VARIABLE}={PAID_EVAL_OPT_IN_VALUE}")
    if not confirmed:
        missing.append("--confirm")
    return missing


def authorize_paid_eval(environ: Mapping[str, str], *, confirmed: bool) -> Settings:
    missing = missing_paid_eval_requirements(environ, confirmed=confirmed)
    if missing:
        raise EvalPreflightError(
            "Real-model evaluation is a paid operation that must be explicitly authorized "
            f"for each run. Missing: {', '.join(missing)}. Run: {PAID_EVAL_COMMAND}"
        )
    if _opt_in_is_persisted(ENV_FILE):
        raise EvalPreflightError(
            f"{PAID_EVAL_OPT_IN_VARIABLE} must be set only on the command line for one run. "
            f"Remove it from {ENV_FILE.name}."
        )

    try:
        return load_settings(environ)
    except InvalidSettingsError as error:
        raise EvalPreflightError(str(error)) from None


def build_eval_provider(settings: Settings) -> IntentModelProvider:
    try:
        return build_model_provider(settings, MODEL_CALL_TIMEOUT_SECONDS)
    except ModelProviderSetupError as error:
        raise EvalPreflightError(f"Invalid AI service environment: {error}") from None


def _opt_in_is_persisted(env_file: Path) -> bool:
    if not env_file.is_file():
        return False
    return any(PERSISTED_OPT_IN_PATTERN.match(line) for line in env_file.read_text().splitlines())


def plan_eval(
    settings: Settings, case_ids: Sequence[str], suite: EvalSuite = INTENT_SUITE
) -> EvalPlan:
    dataset_version, cases = suite.load_dataset(suite.dataset_path)
    unknown = sorted(set(case_ids) - {case.id for case in cases})
    if unknown:
        raise EvalPreflightError(f"Unknown eval case ids: {', '.join(unknown)}")

    if settings.model is None:
        raise EvalPreflightError("AI_MODEL is required to run the eval.")

    selected = [case for case in cases if not case_ids or case.id in case_ids]
    return EvalPlan(
        model=settings.model,
        dataset_version=dataset_version,
        cases=selected,
        suite=suite,
        case_filter=tuple(case_ids),
    )


def preflight_lines(plan: EvalPlan, provider_name: str) -> list[str]:
    return [
        f"Paid real-model {plan.suite.name} eval",
        f"  provider:                 {provider_name}",
        f"  model:                    {plan.model}",
        f"  prompt version:           {plan.suite.prompt_version}",
        f"  dataset:                  {plan.dataset_version}"
        f" ({plan.suite.dataset_path.relative_to(APP_ROOT)})",
        f"  cases:                    {len(plan.cases)}",
        f"  max model requests:       {plan.request_budget}"
        f" ({MAX_PROVIDER_REQUESTS_PER_CASE} per case)",
        f"  paid execution:           explicitly enabled ({PAID_EVAL_OPT_IN_VARIABLE}, --confirm)",
    ]


async def run_eval(plan: EvalPlan, provider: IntentModelProvider) -> dict[str, object]:
    metered = MeteredModelProvider(provider, request_budget=plan.request_budget)
    results: list[CaseResult] = []
    aborted: str | None = None

    for case in plan.cases:
        try:
            result = await _run_case(plan.suite, metered, case)
        except ProviderRequestBudgetExceededError as error:
            aborted = str(error)
            break
        results.append(result)
        if result.error in RUN_ABORTING_ERRORS:
            aborted = f"Provider error {result.error} on case {case.id}"
            break

    return _report(plan, metered, results, aborted)


async def _run_case(
    suite: EvalSuite, metered: MeteredModelProvider, case: AnyEvalCase
) -> CaseResult:
    first_record = len(metered.records)
    failures: list[str] | None
    error: str | None = None
    failed_output: dict[str, Any] | None = None

    try:
        failures, output = await suite.evaluate(metered, case)
        if failures:
            failed_output = output
    except AiServiceError as service_error:
        error = service_error.code
        failures = None

    records = metered.records[first_record:]
    usages = [record.usage for record in records if record.usage is not None]
    return CaseResult(
        id=case.id,
        language=case.language,
        passed=failures == [],
        failures=failures if failures is not None else [f"provider: {error}"],
        expectations=expectation_statuses(case.expect, failures),
        error=error,
        model_requests=len(records),
        model_latency_ms=sum(record.latency_ms for record in records),
        input_tokens=sum(usage.input_tokens for usage in usages),
        output_tokens=sum(usage.output_tokens for usage in usages),
        total_tokens=sum(usage.total_tokens for usage in usages),
        usage_complete=_usage_complete(records),
        failed_output=failed_output,
    )


def _usage_complete(records: Sequence[ProviderRequestRecord]) -> bool:
    return all(record.usage is not None for record in records)


def _sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _report(
    plan: EvalPlan,
    metered: MeteredModelProvider,
    results: list[CaseResult],
    aborted: str | None,
) -> dict[str, object]:
    by_language: dict[str, dict[str, int]] = {}
    for result in results:
        counts = by_language.setdefault(result.language, {"passed": 0, "cases": 0})
        counts["cases"] += 1
        counts["passed"] += result.passed
    passed = sum(result.passed for result in results)

    return {
        "ranAt": datetime.now(UTC).isoformat(),
        "suite": plan.suite.name,
        "provider": metered.name,
        "model": plan.model,
        "responseModels": sorted({record.model for record in metered.records if record.model}),
        "promptVersion": plan.suite.prompt_version,
        "promptSha256": _sha256(plan.suite.system_prompt.encode()),
        "datasetVersion": plan.dataset_version,
        "datasetSha256": _sha256(plan.suite.dataset_path.read_bytes()),
        "caseFilter": list(plan.case_filter) or None,
        "modelSettings": {
            "maxModelRequestsPerCase": MAX_PROVIDER_REQUESTS_PER_CASE,
            "modelCallTimeoutSeconds": MODEL_CALL_TIMEOUT_SECONDS,
        },
        "plannedCases": len(plan.cases),
        "cases": len(results),
        "passed": passed,
        "failed": len(results) - passed,
        "passRate": round(passed / len(results), 4) if results else None,
        "failedCaseIds": [result.id for result in results if not result.passed],
        "erroredCaseIds": [result.id for result in results if result.error is not None],
        "aborted": aborted,
        "modelRequests": metered.request_count,
        "modelRequestBudget": plan.request_budget,
        "casesRequiringRetry": [result.id for result in results if result.model_requests > 1],
        "retryRequests": sum(max(result.model_requests - 1, 0) for result in results),
        "inputTokens": sum(result.input_tokens for result in results),
        "outputTokens": sum(result.output_tokens for result in results),
        "totalTokens": sum(result.total_tokens for result in results),
        "usageComplete": _usage_complete(metered.records),
        "modelLatencyMs": sum(result.model_latency_ms for result in results),
        "byLanguage": dict(sorted(by_language.items())),
        "byExpectation": tally_expectations(result.expectations for result in results),
        "results": [asdict(result) for result in results],
    }


def summary_lines(report: Mapping[str, Any], output_path: Path) -> list[str]:
    return [
        f"Passed {report['passed']}/{report['cases']} of {report['plannedCases']} planned cases",
        f"  aborted:               {report['aborted'] or 'no'}",
        f"  failed cases:          {', '.join(report['failedCaseIds']) or 'none'}",
        f"  model requests:        {report['modelRequests']}"
        f" (budget {report['modelRequestBudget']})",
        f"  cases requiring retry: {len(report['casesRequiringRetry'])}"
        f" ({report['retryRequests']} retry requests)",
        f"  input tokens:          {report['inputTokens']}",
        f"  output tokens:         {report['outputTokens']}",
        f"  total tokens:          {report['totalTokens']}",
        f"  usage complete:        {'yes' if report['usageComplete'] else 'no'}",
        f"  model latency:         {report['modelLatencyMs']} ms",
        "  cost:                  not computed; price the token totals with current pricing",
        f"  results:               {output_path.relative_to(APP_ROOT)}",
    ]


def main(argv: Sequence[str] | None = None, environ: Mapping[str, str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Run a paid AI eval against the real model.", allow_abbrev=False
    )
    parser.add_argument("--confirm", action="store_true", help="authorize paid model requests")
    parser.add_argument(
        "--suite", choices=sorted(EVAL_SUITES), default=INTENT_SUITE.name, help="eval suite"
    )
    parser.add_argument("--case", action="append", default=[], help="run only this case id")
    arguments = parser.parse_args(argv)

    try:
        settings = authorize_paid_eval(
            os.environ if environ is None else environ, confirmed=arguments.confirm
        )
        plan = plan_eval(settings, arguments.case, EVAL_SUITES[arguments.suite])
        provider = build_eval_provider(settings)
    except EvalPreflightError as error:
        raise SystemExit(str(error)) from None

    print("\n".join(preflight_lines(plan, provider.name)), flush=True)
    report = asyncio.run(run_eval(plan, provider))

    RESULTS_DIR.mkdir(exist_ok=True)
    output_path = RESULTS_DIR / f"{plan.suite.name}-eval-{report['ranAt']}.json".replace(":", "-")
    output_path.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print("\n".join(summary_lines(report, output_path)))


if __name__ == "__main__":
    main()
