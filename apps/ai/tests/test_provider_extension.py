import pytest
from fastapi.testclient import TestClient

from app.config.settings import load_settings
from app.interpretation.structured_model_call import MODEL_CALL_TIMEOUT_SECONDS
from app.main import create_app
from app.prompts.refinement import REFINEMENT_MODEL_OUTPUT
from app.providers import registry
from app.providers.model_provider import (
    IntentModelProvider,
    ModelIntentRequest,
    ModelIntentResult,
    ModelInvocationMetadata,
    ModelProviderConfig,
    ModelProviderSetupError,
)
from evals import refinement_eval, run_intent_eval
from evals.intent_eval import EvalCase
from evals.run_intent_eval import REFINEMENT_SUITE, EvalPlan, main, run_eval
from tests.conftest import AUTH_HEADERS, SERVICE_TOKEN
from tests.fakes import (
    FAKE_MODEL,
    FAKE_USAGE,
    current_intent,
    empty_preservation,
    interpreted_output,
    refinement_output,
)

NEW_PROVIDER = "newvendor"
NEW_PROVIDER_KEY = "new-vendor-secret-that-must-never-be-rendered"
NEW_PROVIDER_ENV = {
    "AI_PROVIDER": NEW_PROVIDER,
    "AI_MODEL": "any-model-name",
    "AI_PROVIDER_API_KEY": NEW_PROVIDER_KEY,
}
CASE = EvalCase(
    id="matching",
    language="en",
    prompt="30 deep cuts from Radiohead and Interpol, no Coldplay",
    expect={"outcome": "interpreted", "artists": ["Radiohead", "Interpol"]},
)


class NewVendorProvider:
    def __init__(self, config: ModelProviderConfig) -> None:
        self.config = config

    @property
    def name(self) -> str:
        return NEW_PROVIDER

    @property
    def is_available(self) -> bool:
        return True

    @property
    def invocation_metadata(self) -> ModelInvocationMetadata | None:
        return ModelInvocationMetadata(
            provider_name=NEW_PROVIDER, operation_name="chat", request_model=self.config.model
        )

    async def generate_intent(self, request: ModelIntentRequest) -> ModelIntentResult:
        payload = (
            refinement_output()
            if request.output == REFINEMENT_MODEL_OUTPUT
            else interpreted_output()
        )
        return ModelIntentResult(payload=payload, model=FAKE_MODEL, usage=FAKE_USAGE)


def build_new_vendor(config: ModelProviderConfig) -> IntentModelProvider:
    if config.api_key is None:
        raise ModelProviderSetupError("AI_PROVIDER_API_KEY is required when AI_PROVIDER=newvendor")
    return NewVendorProvider(config)


@pytest.fixture(autouse=True)
def register_new_vendor(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(registry.MODEL_PROVIDER_FACTORIES, NEW_PROVIDER, build_new_vendor)
    monkeypatch.setattr(run_intent_eval, "ENV_FILE", run_intent_eval.APP_ROOT / "missing.env")


def test_a_registered_provider_resolves_from_configuration_alone() -> None:
    settings = load_settings(NEW_PROVIDER_ENV)

    provider = registry.build_model_provider(settings, MODEL_CALL_TIMEOUT_SECONDS)

    assert isinstance(provider, NewVendorProvider)
    assert provider.config.model == "any-model-name"
    assert provider.config.timeout_seconds == MODEL_CALL_TIMEOUT_SECONDS
    assert provider.config.api_key is not None
    assert provider.config.api_key.get_secret_value() == NEW_PROVIDER_KEY
    assert NEW_PROVIDER_KEY not in repr(provider.config)


def test_interpretation_and_refinement_run_unchanged_on_the_new_provider() -> None:
    settings = load_settings({**NEW_PROVIDER_ENV, "AI_SERVICE_TOKEN": SERVICE_TOKEN})
    client = TestClient(create_app(settings), raise_server_exceptions=False)

    interpreted = client.post(
        "/v1/intent/interpret", json={"prompt": CASE.prompt}, headers=AUTH_HEADERS
    )
    refined = client.post(
        "/v1/refinement/plan",
        json={
            "intent": current_intent(),
            "preservation": empty_preservation(),
            "refinement": "Keep it as it is",
        },
        headers=AUTH_HEADERS,
    )
    health = client.get("/health")

    assert interpreted.status_code == 200
    assert interpreted.json()["result"] == interpreted_output()
    assert refined.status_code == 200
    assert refined.json()["result"] == refinement_output()
    assert health.json()["intentInterpretation"] == "available"
    assert NEW_PROVIDER_KEY not in health.text


@pytest.mark.anyio
async def test_the_eval_engine_reports_the_actual_provider() -> None:
    provider = registry.build_model_provider(
        load_settings(NEW_PROVIDER_ENV), MODEL_CALL_TIMEOUT_SECONDS
    )
    plan = EvalPlan(model="any-model-name", dataset_version="test", cases=[CASE])

    report = await run_eval(plan, provider)

    assert report["provider"] == NEW_PROVIDER
    assert report["passed"] == 1
    assert report["responseModels"] == [FAKE_MODEL]
    assert report["usageComplete"] is True
    assert NEW_PROVIDER_KEY not in str(report)


@pytest.mark.anyio
async def test_the_refinement_eval_runs_unchanged_on_the_new_provider() -> None:
    provider = registry.build_model_provider(
        load_settings(NEW_PROVIDER_ENV), MODEL_CALL_TIMEOUT_SECONDS
    )
    case = next(iter(refinement_eval.load_dataset()[1]))
    plan = EvalPlan(
        model="any-model-name", dataset_version="test", cases=[case], suite=REFINEMENT_SUITE
    )

    report = await run_eval(plan, provider)

    assert report["suite"] == "refinement"
    assert report["provider"] == NEW_PROVIDER
    assert report["modelRequests"] >= 1


def test_the_paid_eval_authorizes_and_builds_the_new_provider_through_the_registry(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    async def skip_run(plan: EvalPlan, provider: IntentModelProvider) -> None:
        raise SystemExit(f"ran with {provider.name}")

    monkeypatch.setattr(run_intent_eval, "run_eval", skip_run)

    with pytest.raises(SystemExit, match=f"ran with {NEW_PROVIDER}"):
        main(["--confirm"], {**NEW_PROVIDER_ENV, "ALLOW_PAID_AI_EVALS": "true"})

    output = capsys.readouterr().out
    assert f"provider:                 {NEW_PROVIDER}" in output
    assert NEW_PROVIDER_KEY not in output


def test_the_paid_eval_rejects_an_unregistered_provider_before_any_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delitem(registry.MODEL_PROVIDER_FACTORIES, NEW_PROVIDER)

    with pytest.raises(SystemExit, match="AI_PROVIDER must be one of"):
        main(["--confirm"], {**NEW_PROVIDER_ENV, "ALLOW_PAID_AI_EVALS": "true"})


def test_the_paid_eval_surfaces_provider_specific_requirements_without_the_secret(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    environ = {**NEW_PROVIDER_ENV, "ALLOW_PAID_AI_EVALS": "true"}
    del environ["AI_PROVIDER_API_KEY"]

    with pytest.raises(SystemExit, match="AI_PROVIDER_API_KEY is required"):
        main(["--confirm"], environ)
