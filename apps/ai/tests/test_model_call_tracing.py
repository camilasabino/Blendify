import asyncio
import json
import logging
from collections.abc import Mapping

import httpx2
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from opentelemetry.sdk.trace import ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import (
    INVALID_SPAN,
    SpanKind,
    StatusCode,
    format_span_id,
    format_trace_id,
    get_current_span,
)

from app.config.settings import Settings
from app.interpretation.intent_interpreter import IntentInterpreter
from app.main import create_app
from app.models.interpretation import InterpretIntentRequest
from app.observability.span_privacy import EXPORTABLE_SPAN_ATTRIBUTES
from app.observability.telemetry_config import load_telemetry_config
from app.observability.telemetry_runtime import TelemetryRuntime, build_telemetry_runtime
from app.prompts.intent import INTENT_PROMPT_VERSION
from app.prompts.refinement import REFINEMENT_PROMPT_VERSION
from app.providers.model_provider import (
    IntentModelProvider,
    ModelConfigurationError,
    ModelIntentRequest,
    ModelIntentResult,
    ModelInvalidOutputError,
    ModelRateLimitedError,
    ModelTimeoutError,
    ModelTokenUsage,
    ModelUnavailableError,
)
from app.providers.openai.provider import OpenAIIntentModelProvider
from tests.conftest import AUTH_HEADERS, SERVICE_TOKEN
from tests.fakes import (
    FAKE_GEN_AI_OPERATION,
    FAKE_GEN_AI_PROVIDER,
    FAKE_MODEL,
    FAKE_REQUEST_MODEL,
    FAKE_USAGE,
    HangingModelProvider,
    ScriptedModelProvider,
    ScriptedOutput,
    current_intent,
    empty_preservation,
    interpreted_output,
    refinement_output,
)
from tests.providers.openai.test_openai_provider import API_KEY, MODEL, responses_body

INTERPRET_ROUTE = "/v1/intent/interpret"
REFINEMENT_ROUTE = "/v1/refinement/plan"
EVENT_LOGGER = "app.observability.model_call_log"
REQUEST_ID = "3f1c2a9e-7b4d-4e8a-9c1f-2d6b5e8a7c30"
PROMPT_SENTINEL = "PROMPT_TELEMETRY_SENTINEL"
OUTPUT_SENTINEL = "MODEL_OUTPUT_TELEMETRY_SENTINEL"
ERROR_SENTINEL = "PROVIDER_ERROR_TELEMETRY_SENTINEL"
SENTINELS = (PROMPT_SENTINEL, OUTPUT_SENTINEL, ERROR_SENTINEL, SERVICE_TOKEN, API_KEY)
INVOCATION_SPAN_NAME = f"{FAKE_GEN_AI_OPERATION} {FAKE_REQUEST_MODEL}"
INVALID_USAGE = ModelTokenUsage(input_tokens=90, output_tokens=7, total_tokens=97)


class UsageFreeModelProvider(ScriptedModelProvider):
    async def generate_intent(self, request: ModelIntentRequest) -> ModelIntentResult:
        result = await super().generate_intent(request)
        return ModelIntentResult(payload=result.payload, model=result.model, usage=None)


class InternallyRetryingModelProvider(ScriptedModelProvider):
    def __init__(self, transport_attempts: int) -> None:
        super().__init__([interpreted_output()])
        self._transport_attempts = transport_attempts
        self.transport_requests = 0

    async def generate_intent(self, request: ModelIntentRequest) -> ModelIntentResult:
        for _ in range(self._transport_attempts):
            self.transport_requests += 1
            await asyncio.sleep(0)
        return await super().generate_intent(request)


class Telemetry:
    def __init__(self) -> None:
        self.exporter = InMemorySpanExporter()
        self.unfiltered = InMemorySpanExporter()
        sdk_provider = TracerProvider(shutdown_on_exit=False)
        sdk_provider.add_span_processor(SimpleSpanProcessor(self.unfiltered))
        self.runtime = TelemetryRuntime(sdk_provider, lambda: self.exporter)

    @property
    def spans(self) -> tuple[ReadableSpan, ...]:
        return self.exporter.get_finished_spans()

    def of_kind(self, kind: SpanKind) -> list[ReadableSpan]:
        return sorted(
            (span for span in self.spans if span.kind is kind),
            key=lambda span: span.start_time or 0,
        )

    def only(self, kind: SpanKind) -> ReadableSpan:
        (span,) = self.of_kind(kind)
        return span

    def exported_text(self) -> str:
        return "\n".join(span.to_json() for span in self.spans)


def _app(settings: Settings, provider: IntentModelProvider | None, telemetry: Telemetry) -> FastAPI:
    return create_app(settings, provider, telemetry=telemetry.runtime)


def _interpret(
    app: FastAPI, prompt: str = f"{PROMPT_SENTINEL} with Radiohead", **headers: str
) -> httpx2.Response:
    with TestClient(app, raise_server_exceptions=False) as client:
        return client.post(
            INTERPRET_ROUTE, json={"prompt": prompt}, headers={**AUTH_HEADERS, **headers}
        )


def _refine(app: FastAPI) -> httpx2.Response:
    with TestClient(app, raise_server_exceptions=False) as client:
        return client.post(
            REFINEMENT_ROUTE,
            json={
                "intent": current_intent(),
                "preservation": empty_preservation(),
                "refinement": PROMPT_SENTINEL,
            },
            headers=AUTH_HEADERS,
        )


def _attributes(span: ReadableSpan) -> dict[str, object]:
    return dict(span.attributes or {})


def _model_events(caplog: pytest.LogCaptureFixture) -> list[dict[str, object]]:
    return [
        json.loads(record.getMessage()) for record in caplog.records if record.name == EVENT_LOGGER
    ]


def _assert_private(telemetry: Telemetry) -> None:
    exported = telemetry.exported_text()
    for sentinel in SENTINELS:
        assert sentinel not in exported
    for span in telemetry.spans:
        assert set(_attributes(span)) <= EXPORTABLE_SPAN_ATTRIBUTES
        assert span.events == ()
        assert span.status.description is None
    for span in telemetry.unfiltered.get_finished_spans():
        if span.kind is not SpanKind.SERVER:
            assert span.events == ()
            assert span.status.description is None


def test_interpretation_exports_the_use_case_and_inference_hierarchy(settings: Settings) -> None:
    telemetry = Telemetry()
    provider = ScriptedModelProvider([interpreted_output(artists=[OUTPUT_SENTINEL])])

    response = _interpret(_app(settings, provider, telemetry), **{"X-Request-Id": REQUEST_ID})

    server = telemetry.only(SpanKind.SERVER)
    use_case = telemetry.only(SpanKind.INTERNAL)
    inference = telemetry.only(SpanKind.CLIENT)
    assert response.status_code == 200
    assert len(telemetry.spans) == 3
    assert use_case.parent is not None and use_case.parent.span_id == server.context.span_id
    assert inference.parent is not None and inference.parent.span_id == use_case.context.span_id
    assert use_case.name == "blendify.ai.interpret"
    assert _attributes(use_case) == {
        "blendify.ai.operation": "intent_interpretation",
        "blendify.ai.prompt.version": INTENT_PROMPT_VERSION,
        "blendify.request_id": REQUEST_ID,
        "blendify.ai.result": "completed",
        "blendify.ai.outcome": "interpreted",
    }
    assert inference.name == INVOCATION_SPAN_NAME
    assert _attributes(inference) == {
        "gen_ai.provider.name": FAKE_GEN_AI_PROVIDER,
        "gen_ai.operation.name": FAKE_GEN_AI_OPERATION,
        "gen_ai.request.model": FAKE_REQUEST_MODEL,
        "gen_ai.response.model": FAKE_MODEL,
        "gen_ai.usage.input_tokens": FAKE_USAGE.input_tokens,
        "gen_ai.usage.output_tokens": FAKE_USAGE.output_tokens,
        "blendify.ai.operation": "intent_interpretation",
        "blendify.ai.prompt.version": INTENT_PROMPT_VERSION,
        "blendify.ai.attempt": 1,
        "blendify.ai.result": "ok",
    }
    for span in telemetry.spans:
        assert span.status.status_code is StatusCode.UNSET
    _assert_private(telemetry)


def test_refinement_exports_its_own_use_case_and_inference_hierarchy(settings: Settings) -> None:
    telemetry = Telemetry()

    response = _refine(_app(settings, ScriptedModelProvider([refinement_output()]), telemetry))

    server = telemetry.only(SpanKind.SERVER)
    use_case = telemetry.only(SpanKind.INTERNAL)
    inference = telemetry.only(SpanKind.CLIENT)
    assert response.status_code == 200
    assert server.name == f"POST {REFINEMENT_ROUTE}"
    assert use_case.name == "blendify.ai.refine"
    assert use_case.parent is not None and use_case.parent.span_id == server.context.span_id
    assert inference.parent is not None and inference.parent.span_id == use_case.context.span_id
    assert _attributes(use_case)["blendify.ai.operation"] == "refinement_interpretation"
    assert _attributes(use_case)["blendify.ai.prompt.version"] == REFINEMENT_PROMPT_VERSION
    assert _attributes(inference)["blendify.ai.prompt.version"] == REFINEMENT_PROMPT_VERSION
    assert _attributes(inference)["blendify.ai.result"] == "ok"
    _assert_private(telemetry)


def test_needs_clarification_is_a_successful_outcome_not_an_error(settings: Settings) -> None:
    telemetry = Telemetry()
    clarification = {
        "outcome": "needs_clarification",
        "clarification": {"reason": "ambiguous_request", "unsupportedConstraints": []},
    }

    response = _interpret(_app(settings, ScriptedModelProvider([clarification]), telemetry))

    use_case = telemetry.only(SpanKind.INTERNAL)
    assert response.status_code == 200
    assert _attributes(use_case)["blendify.ai.outcome"] == "needs_clarification"
    assert use_case.status.status_code is StatusCode.UNSET


def test_recovered_retry_keeps_the_failed_attempt_visible(
    settings: Settings, caplog: pytest.LogCaptureFixture
) -> None:
    telemetry = Telemetry()
    outputs: list[ScriptedOutput] = [{"outcome": OUTPUT_SENTINEL}, interpreted_output()]
    provider = ScriptedModelProvider(list(outputs))
    untraced_calls = _untraced_provider_calls(settings, outputs)

    with caplog.at_level(logging.INFO):
        response = _interpret(_app(settings, provider, telemetry))

    first, second = telemetry.of_kind(SpanKind.CLIENT)
    use_case = telemetry.only(SpanKind.INTERNAL)
    assert response.status_code == 200
    assert len(provider.requests) == 2 == untraced_calls
    assert _attributes(first)["blendify.ai.attempt"] == 1
    assert _attributes(first)["blendify.ai.result"] == "invalid_output"
    assert _attributes(first)["error.type"] == "invalid_output"
    assert _attributes(first)["blendify.ai.validation_error_count"] >= 1  # type: ignore[operator]
    assert _attributes(first)["gen_ai.usage.input_tokens"] == FAKE_USAGE.input_tokens
    assert first.status.status_code is StatusCode.ERROR
    assert _attributes(second)["blendify.ai.attempt"] == 2
    assert _attributes(second)["blendify.ai.result"] == "ok"
    assert "error.type" not in _attributes(second)
    assert second.status.status_code is StatusCode.UNSET
    for attempt in (first, second):
        assert attempt.parent is not None and attempt.parent.span_id == use_case.context.span_id
    assert _attributes(use_case)["blendify.ai.result"] == "completed"
    assert use_case.status.status_code is StatusCode.UNSET
    trace_id = format_trace_id(use_case.context.trace_id)
    request_events = [
        event
        for event in _model_events(caplog)
        if event["event"] == "ai.model_request" and event.get("traceId") == trace_id
    ]
    assert [event["spanId"] for event in request_events] == [
        format_span_id(first.context.span_id),
        format_span_id(second.context.span_id),
    ]
    _assert_private(telemetry)


def test_exhausted_retries_fail_the_use_case_with_a_safe_code(settings: Settings) -> None:
    telemetry = Telemetry()
    invalid = ModelInvalidOutputError(f"refused: {ERROR_SENTINEL}")
    provider = ScriptedModelProvider([invalid, {"outcome": OUTPUT_SENTINEL}])

    response = _interpret(_app(settings, provider, telemetry))

    attempts = telemetry.of_kind(SpanKind.CLIENT)
    use_case = telemetry.only(SpanKind.INTERNAL)
    assert response.status_code == 502
    assert len(provider.requests) == len(attempts) == 2
    for attempt in attempts:
        assert attempt.status.status_code is StatusCode.ERROR
        assert _attributes(attempt)["error.type"] == "invalid_output"
    assert _attributes(use_case)["blendify.ai.result"] == "failed"
    assert _attributes(use_case)["blendify.ai.error_code"] == "INVALID_MODEL_OUTPUT"
    assert _attributes(use_case)["error.type"] == "INVALID_MODEL_OUTPUT"
    assert "blendify.ai.outcome" not in _attributes(use_case)
    assert use_case.status.status_code is StatusCode.ERROR
    _assert_private(telemetry)


@pytest.mark.parametrize(
    ("error", "result", "error_code", "status_code"),
    [
        (ModelTimeoutError(ERROR_SENTINEL), "timeout", "MODEL_TIMEOUT", 504),
        (ModelRateLimitedError(ERROR_SENTINEL), "rate_limited", "MODEL_RATE_LIMITED", 429),
        (ModelUnavailableError(ERROR_SENTINEL), "unavailable", "MODEL_UNAVAILABLE", 503),
        (ModelConfigurationError("authentication"), "misconfigured", "MODEL_UNAVAILABLE", 503),
    ],
)
def test_provider_failures_are_classified_without_exception_details(
    settings: Settings, error: Exception, result: str, error_code: str, status_code: int
) -> None:
    telemetry = Telemetry()
    provider = ScriptedModelProvider([error])

    response = _interpret(_app(settings, provider, telemetry))

    inference = telemetry.only(SpanKind.CLIENT)
    use_case = telemetry.only(SpanKind.INTERNAL)
    assert response.status_code == status_code
    assert len(provider.requests) == 1
    assert inference.status.status_code is StatusCode.ERROR
    assert _attributes(inference)["blendify.ai.result"] == result
    assert _attributes(inference)["error.type"] == result
    for missing in ("gen_ai.response.model", "gen_ai.usage.input_tokens"):
        assert missing not in _attributes(inference)
    assert use_case.status.status_code is StatusCode.ERROR
    assert _attributes(use_case)["blendify.ai.error_code"] == error_code
    assert _attributes(use_case)["error.type"] == error_code
    _assert_private(telemetry)


def test_service_timeout_closes_the_inference_span_as_a_timeout(settings: Settings) -> None:
    telemetry = Telemetry()
    app = _app(settings, ScriptedModelProvider([]), telemetry)
    app.state.intent_interpreter = IntentInterpreter(
        HangingModelProvider(),
        model_call_timeout_seconds=0.01,
        tracer_provider=telemetry.runtime.tracer_provider,
    )

    response = _interpret(app)

    inference = telemetry.only(SpanKind.CLIENT)
    assert response.status_code == 504
    assert _attributes(inference)["error.type"] == "timeout"
    assert _attributes(telemetry.only(SpanKind.INTERNAL))["error.type"] == "MODEL_TIMEOUT"


def test_unexpected_provider_exceptions_close_spans_with_a_generic_error_type(
    settings: Settings,
) -> None:
    telemetry = Telemetry()

    response = _interpret(
        _app(settings, ScriptedModelProvider([RuntimeError(ERROR_SENTINEL)]), telemetry)
    )

    assert response.status_code == 500
    for kind in (SpanKind.CLIENT, SpanKind.INTERNAL):
        span = telemetry.only(kind)
        assert span.status.status_code is StatusCode.ERROR
        assert _attributes(span)["error.type"] == "_OTHER"
        assert "blendify.ai.result" not in _attributes(span)
    _assert_private(telemetry)


def test_usage_is_exact_per_attempt_and_never_aggregated_on_parents(
    settings: Settings, caplog: pytest.LogCaptureFixture
) -> None:
    telemetry = Telemetry()
    invalid = ModelInvalidOutputError("not json", model=None, usage=INVALID_USAGE)
    provider = ScriptedModelProvider([invalid, interpreted_output()])

    with caplog.at_level(logging.INFO):
        response = _interpret(_app(settings, provider, telemetry))

    first, second = telemetry.of_kind(SpanKind.CLIENT)
    call_event = _model_events(caplog)[-1]
    assert response.status_code == 200
    assert _attributes(first)["gen_ai.usage.input_tokens"] == INVALID_USAGE.input_tokens
    assert _attributes(first)["gen_ai.usage.output_tokens"] == INVALID_USAGE.output_tokens
    assert "gen_ai.response.model" not in _attributes(first)
    assert _attributes(second)["gen_ai.usage.input_tokens"] == FAKE_USAGE.input_tokens
    assert _attributes(second)["gen_ai.response.model"] == FAKE_MODEL
    for kind in (SpanKind.INTERNAL, SpanKind.SERVER):
        assert not any(key.startswith("gen_ai.") for key in _attributes(telemetry.only(kind)))
    assert call_event["inputTokens"] == sum(
        int(_attributes(span)["gen_ai.usage.input_tokens"])  # type: ignore[call-overload]
        for span in (first, second)
    )


def test_missing_usage_is_omitted_rather_than_zero(settings: Settings) -> None:
    telemetry = Telemetry()

    response = _interpret(_app(settings, UsageFreeModelProvider([interpreted_output()]), telemetry))

    attributes = _attributes(telemetry.only(SpanKind.CLIENT))
    assert response.status_code == 200
    assert "gen_ai.usage.input_tokens" not in attributes
    assert "gen_ai.usage.output_tokens" not in attributes
    assert attributes["gen_ai.response.model"] == FAKE_MODEL


def test_disabled_provider_records_the_use_case_without_a_fictional_inference(
    settings: Settings,
) -> None:
    telemetry = Telemetry()

    response = _interpret(_app(settings, None, telemetry))

    use_case = telemetry.only(SpanKind.INTERNAL)
    assert response.status_code == 503
    assert telemetry.of_kind(SpanKind.CLIENT) == []
    assert _attributes(use_case)["blendify.ai.error_code"] == "MODEL_UNAVAILABLE"
    assert use_case.status.status_code is StatusCode.ERROR


@pytest.mark.parametrize(
    ("body", "headers", "status_code"),
    [
        ({"prompt": PROMPT_SENTINEL}, {}, 401),
        ({"unexpected": PROMPT_SENTINEL}, AUTH_HEADERS, 422),
    ],
)
def test_requests_rejected_before_the_use_case_create_no_model_spans(
    settings: Settings, body: Mapping[str, str], headers: Mapping[str, str], status_code: int
) -> None:
    telemetry = Telemetry()
    provider = ScriptedModelProvider([interpreted_output()])

    with TestClient(_app(settings, provider, telemetry)) as client:
        response = client.post(INTERPRET_ROUTE, json=body, headers=headers)

    assert response.status_code == status_code
    assert provider.requests == []
    assert [span.kind for span in telemetry.spans] == [SpanKind.SERVER]
    _assert_private(telemetry)


def test_one_inference_span_per_adapter_invocation_regardless_of_transport_attempts(
    settings: Settings,
) -> None:
    telemetry = Telemetry()
    provider = InternallyRetryingModelProvider(transport_attempts=3)

    response = _interpret(_app(settings, provider, telemetry))

    assert response.status_code == 200
    assert provider.transport_requests == 3
    assert len(provider.requests) == 1
    assert len(telemetry.of_kind(SpanKind.CLIENT)) == 1


@pytest.mark.parametrize(
    ("status_code", "body", "expected_status", "expected_result"),
    [
        (200, responses_body(), 200, "ok"),
        (500, {"error": {"message": ERROR_SENTINEL, "type": "server_error"}}, 503, "unavailable"),
    ],
)
def test_openai_adapter_spans_follow_the_gen_ai_conventions(
    settings: Settings,
    status_code: int,
    body: dict[str, object],
    expected_status: int,
    expected_result: str,
) -> None:
    telemetry = Telemetry()
    transport_requests: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        transport_requests.append(request)
        return httpx2.Response(status_code, json=body)

    provider = OpenAIIntentModelProvider(
        api_key=API_KEY,
        model=MODEL,
        timeout_seconds=5.0,
        http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(handler)),
    )

    response = _interpret(_app(settings, provider, telemetry))

    inference = telemetry.only(SpanKind.CLIENT)
    assert response.status_code == expected_status
    assert len(transport_requests) == 1
    assert inference.name == f"chat {MODEL}"
    assert _attributes(inference)["gen_ai.provider.name"] == "openai"
    assert _attributes(inference)["gen_ai.operation.name"] == "chat"
    assert _attributes(inference)["gen_ai.request.model"] == MODEL
    assert _attributes(inference)["blendify.ai.result"] == expected_result
    if expected_result == "ok":
        assert _attributes(inference)["gen_ai.response.model"] == f"{MODEL}-2026-09-01"
    else:
        assert "gen_ai.response.model" not in _attributes(inference)
    _assert_private(telemetry)


@pytest.mark.anyio
async def test_cancellation_propagates_and_closes_both_spans(settings: Settings) -> None:
    telemetry = Telemetry()
    interpreter = IntentInterpreter(
        HangingModelProvider(), tracer_provider=telemetry.runtime.tracer_provider
    )
    telemetry.runtime.start()

    task = asyncio.create_task(
        interpreter.interpret(InterpretIntentRequest.model_validate({"prompt": PROMPT_SENTINEL}))
    )
    await asyncio.sleep(0.01)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    telemetry.runtime.shutdown()

    assert get_current_span() is INVALID_SPAN
    for kind in (SpanKind.INTERNAL, SpanKind.CLIENT):
        span = telemetry.only(kind)
        assert span.end_time is not None
        assert span.status.status_code is StatusCode.ERROR
        assert _attributes(span)["error.type"] == "_OTHER"
    _assert_private(telemetry)


def test_tracing_does_not_change_responses_or_provider_calls(settings: Settings) -> None:
    telemetry = Telemetry()
    outputs: list[ScriptedOutput] = [{"outcome": "invalid"}, interpreted_output()]
    traced_provider = ScriptedModelProvider(list(outputs))
    untraced_provider = ScriptedModelProvider(list(outputs))
    disabled = build_telemetry_runtime(load_telemetry_config({}), "development")

    traced = _interpret(_app(settings, traced_provider, telemetry))
    untraced = _interpret(create_app(settings, untraced_provider, telemetry=disabled))

    assert not disabled.is_enabled
    assert traced.status_code == untraced.status_code == 200
    assert traced.json() == untraced.json()
    assert len(traced_provider.requests) == len(untraced_provider.requests) == 2
    assert len(telemetry.of_kind(SpanKind.CLIENT)) == 2


def test_use_cases_without_a_tracer_provider_never_trace() -> None:
    interpreter = IntentInterpreter(ScriptedModelProvider([interpreted_output()]))

    response = asyncio.run(
        interpreter.interpret(InterpretIntentRequest.model_validate({"prompt": "Radiohead"}))
    )

    assert response.result.outcome == "interpreted"
    assert get_current_span() is INVALID_SPAN


def _untraced_provider_calls(settings: Settings, outputs: list[ScriptedOutput]) -> int:
    provider = ScriptedModelProvider(list(outputs))
    _interpret(create_app(settings, provider))
    return len(provider.requests)
