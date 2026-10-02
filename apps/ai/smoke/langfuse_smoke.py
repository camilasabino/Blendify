import argparse
import logging
import os
import secrets
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from http import HTTPStatus
from types import MappingProxyType
from urllib.parse import urlsplit

from fastapi.testclient import TestClient
from opentelemetry import trace
from opentelemetry.sdk.trace import ReadableSpan
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult
from pydantic import SecretStr

from app.config.settings import Settings
from app.main import create_app
from app.observability.langfuse_mapping import (
    GENERATION_OBSERVATION,
    LANGFUSE_OBSERVATION_TYPE,
    SPAN_OBSERVATION,
)
from app.observability.telemetry_config import (
    DEPLOYMENT_ENVIRONMENT_ATTRIBUTE,
    LOOPBACK_HOSTS,
    SUPPORTED_SAMPLER,
    InvalidTelemetryConfigError,
    TelemetryConfig,
    load_telemetry_config,
)
from app.observability.telemetry_runtime import (
    build_telemetry_runtime,
    configured_exporter_factory,
)
from smoke.synthetic_provider import (
    SYNTHETIC_PROVIDER_NAME,
    SyntheticModelProvider,
    SyntheticReply,
    interpreted_intent_payload,
    interpreted_refinement_payload,
    invalid_output_payload,
    synthetic_intent,
    synthetic_preservation,
    synthetic_usage,
)

INTERPRET_ROUTE = "/v1/intent/interpret"
REFINEMENT_ROUTE = "/v1/refinement/plan"
SMOKE_COMMAND = "npm run smoke:langfuse -- --confirm"
SMOKE_ENVIRONMENT = "telemetry-smoke"
SMOKE_SAMPLER_RATIO = "1"
SYNTHETIC_PROMPT = "Synthetic telemetry smoke request"
SYNTHETIC_REFINEMENT = "Synthetic telemetry smoke refinement"
SERVICE_TOKEN_BYTES = 32
SPANS_AROUND_MODEL_CALLS = 2
TELEMETRY_OVERRIDES: Mapping[str, str] = MappingProxyType(
    {
        "OTEL_SDK_DISABLED": "false",
        "OTEL_TRACES_EXPORTER": "otlp",
        "AI_TELEMETRY_BACKEND": "langfuse",
        "OTEL_TRACES_SAMPLER": SUPPORTED_SAMPLER,
        "OTEL_TRACES_SAMPLER_ARG": SMOKE_SAMPLER_RATIO,
        "OTEL_RESOURCE_ATTRIBUTES": f"{DEPLOYMENT_ENVIRONMENT_ATTRIBUTE}={SMOKE_ENVIRONMENT}",
    }
)


class SmokePreflightError(Exception):
    pass


@dataclass(frozen=True, slots=True)
class SmokeRequest:
    label: str
    route: str
    body: Mapping[str, object]
    replies: tuple[SyntheticReply, ...]

    @property
    def expected_observations(self) -> int:
        return SPANS_AROUND_MODEL_CALLS + len(self.replies)


SMOKE_REQUESTS = (
    SmokeRequest(
        label="interpretation",
        route=INTERPRET_ROUTE,
        body={"prompt": SYNTHETIC_PROMPT},
        replies=(SyntheticReply(interpreted_intent_payload(), synthetic_usage(101, 11)),),
    ),
    SmokeRequest(
        label="refinement",
        route=REFINEMENT_ROUTE,
        body={
            "intent": synthetic_intent(),
            "preservation": synthetic_preservation(),
            "refinement": SYNTHETIC_REFINEMENT,
        },
        replies=(SyntheticReply(interpreted_refinement_payload(), synthetic_usage(202, 22)),),
    ),
    SmokeRequest(
        label="recovered retry",
        route=INTERPRET_ROUTE,
        body={"prompt": SYNTHETIC_PROMPT},
        replies=(
            SyntheticReply(invalid_output_payload(), synthetic_usage(303, 33)),
            SyntheticReply(interpreted_intent_payload(), synthetic_usage(404, 44)),
        ),
    ),
)
EXPECTED_MODEL_CALLS = sum(len(request.replies) for request in SMOKE_REQUESTS)
EXPECTED_TRACE_SIZES = [request.expected_observations for request in SMOKE_REQUESTS]
EXPECTED_OBSERVATIONS = sum(EXPECTED_TRACE_SIZES)


@dataclass(frozen=True, slots=True)
class ExportedObservation:
    trace_id: int
    span_id: int
    start_time: int
    observation_type: object


@dataclass(frozen=True, slots=True)
class ExportCall:
    observations: tuple[ExportedObservation, ...]
    acknowledged: bool


@dataclass(frozen=True, slots=True)
class SmokeResult:
    statuses: tuple[int, ...]
    model_calls: int
    export_calls: tuple[ExportCall, ...]


class ExportAcknowledgementRecorder(SpanExporter):
    def __init__(self, exporter: SpanExporter) -> None:
        self._exporter = exporter
        self.calls: list[ExportCall] = []

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        acknowledged = False
        try:
            result = self._exporter.export(spans)
            acknowledged = result is SpanExportResult.SUCCESS
            return result
        finally:
            self.calls.append(ExportCall(_observations(spans), acknowledged))

    def shutdown(self) -> None:
        self._exporter.shutdown()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return self._exporter.force_flush(timeout_millis)


def load_smoke_config(environ: Mapping[str, str]) -> TelemetryConfig:
    try:
        config = load_telemetry_config({**environ, **TELEMETRY_OVERRIDES})
    except InvalidTelemetryConfigError as error:
        raise SmokePreflightError(str(error)) from None

    if config.otlp is None:
        raise SmokePreflightError("The smoke requires the OTLP traces exporter")
    return config


def plan_lines(config: TelemetryConfig) -> list[str]:
    sizes = " + ".join(str(size) for size in EXPECTED_TRACE_SIZES)
    labels = "; ".join(request.label for request in SMOKE_REQUESTS)
    timeout = config.otlp.timeout_seconds if config.otlp else 0
    return [
        "Langfuse telemetry smoke (synthetic requests; no real model provider is built)",
        f"  destination:            {_destination(config)}",
        f"  environment:            {SMOKE_ENVIRONMENT}",
        f"  sampling:               {SUPPORTED_SAMPLER} at ratio {SMOKE_SAMPLER_RATIO}"
        " for this run (requests carry no traceparent)",
        f"  functional requests:    {len(SMOKE_REQUESTS)} ({labels})",
        f"  synthetic model calls:  {EXPECTED_MODEL_CALLS} (in process, no network)",
        f"  observations:           {EXPECTED_OBSERVATIONS} unique spans ({sizes})",
        "  OTLP export calls:      usually 1 batch, sent when the app shuts down",
        "  HTTP attempts per call: 1 when accepted; the exporter itself may resend on 429,"
        f" 502, 503, 504 or connection errors within {timeout:g} s",
        "  delivery:               not guaranteed and not exactly once",
        "  reruns:                 none; another run is a separate, explicitly authorized command",
    ]


def run_smoke(config: TelemetryConfig) -> SmokeResult:
    exporter_factory = configured_exporter_factory(config)
    if exporter_factory is None:
        raise SmokePreflightError("The smoke requires the OTLP traces exporter")

    recorder = ExportAcknowledgementRecorder(exporter_factory())
    settings = Settings(
        environment="development",
        service_token=SecretStr(secrets.token_urlsafe(SERVICE_TOKEN_BYTES)),
        model_provider=SYNTHETIC_PROVIDER_NAME,
    )
    runtime = build_telemetry_runtime(config, settings.environment, span_exporter=recorder)
    provider = SyntheticModelProvider(
        [reply for request in SMOKE_REQUESTS for reply in request.replies]
    )
    app = create_app(settings, provider, telemetry=runtime)
    token = settings.service_token.get_secret_value() if settings.service_token else ""
    headers = {"Authorization": f"Bearer {token}"}

    with TestClient(app, raise_server_exceptions=False) as client:
        statuses = tuple(
            client.post(request.route, json=request.body, headers=headers).status_code
            for request in SMOKE_REQUESTS
        )
    return SmokeResult(statuses, provider.calls, tuple(recorder.calls))


def report_lines(result: SmokeResult) -> list[str]:
    traces = _traces(result.export_calls)
    observations = [observation for _trace_id, members in traces for observation in members]
    acknowledged = sum(call.acknowledged for call in result.export_calls)
    labels = (
        [request.label for request in SMOKE_REQUESTS]
        if len(traces) == len(SMOKE_REQUESTS)
        else ["trace"] * len(traces)
    )
    lines = [
        "Result",
        f"  responses:              {', '.join(str(status) for status in result.statuses)}",
        f"  synthetic model calls:  {result.model_calls} of {EXPECTED_MODEL_CALLS}",
        f"  observations:           {len(observations)} of {EXPECTED_OBSERVATIONS} handed to the"
        f" OTLP exporter ({_count(observations, SPAN_OBSERVATION)} span,"
        f" {_count(observations, GENERATION_OBSERVATION)} generation)",
        f"  OTLP export calls:      {len(result.export_calls)} ({acknowledged} acknowledged with"
        f" HTTP 2xx, {len(result.export_calls) - acknowledged} not acknowledged)",
        "  trace IDs (OpenTelemetry trace IDs; Langfuse keeps the same hex ID):",
    ]
    lines.extend(
        f"    {label:<16} {len(members)} observations  {trace.format_trace_id(trace_id)}"
        for label, (trace_id, members) in zip(labels, traces, strict=True)
    )
    lines.append(
        "  An acknowledgement only means the endpoint accepted the HTTP request; it does not"
        " prove that Langfuse processed or displays the observations."
    )
    return lines


def smoke_problems(result: SmokeResult) -> list[str]:
    problems: list[str] = []
    sizes = [len(members) for _trace_id, members in _traces(result.export_calls)]

    if any(status != HTTPStatus.OK for status in result.statuses):
        problems.append("not every synthetic request answered 200")
    if result.model_calls != EXPECTED_MODEL_CALLS:
        problems.append(
            f"{result.model_calls} synthetic model calls, expected {EXPECTED_MODEL_CALLS}"
        )
    if sizes != EXPECTED_TRACE_SIZES:
        problems.append(f"observations per trace were {sizes}, expected {EXPECTED_TRACE_SIZES}")
    if not result.export_calls or not all(call.acknowledged for call in result.export_calls):
        problems.append("not every OTLP export call was acknowledged with HTTP 2xx")
    return problems


def main(argv: Sequence[str] | None = None, environ: Mapping[str, str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Export three synthetic AI-service traces to the configured Langfuse project.",
        allow_abbrev=False,
    )
    parser.add_argument(
        "--confirm", action="store_true", help="authorize exporting the synthetic traces once"
    )
    arguments = parser.parse_args(argv)

    try:
        config = load_smoke_config(os.environ if environ is None else environ)
    except SmokePreflightError as error:
        raise SystemExit(str(error)) from None

    print("\n".join(plan_lines(config)), flush=True)
    if not arguments.confirm:
        raise SystemExit(
            "Nothing was sent. Exporting telemetry must be authorized for each run: "
            f"{SMOKE_COMMAND}"
        )

    logging.basicConfig(level=logging.WARNING)
    result = run_smoke(config)
    print("\n".join(report_lines(result)), flush=True)

    problems = smoke_problems(result)
    if problems:
        raise SystemExit(
            f"Smoke failed: {'; '.join(problems)}. It is not retried automatically; run it "
            "again only with explicit authorization."
        )
    print(
        "Smoke finished: every export call was acknowledged. Ingestion is verified only by "
        "checking the traces in Langfuse."
    )


def _observations(spans: Sequence[ReadableSpan]) -> tuple[ExportedObservation, ...]:
    observations = []
    for span in spans:
        context = span.get_span_context()
        if context is None:
            continue
        observations.append(
            ExportedObservation(
                trace_id=context.trace_id,
                span_id=context.span_id,
                start_time=span.start_time or 0,
                observation_type=(span.attributes or {}).get(LANGFUSE_OBSERVATION_TYPE),
            )
        )
    return tuple(observations)


def _traces(
    calls: Sequence[ExportCall],
) -> list[tuple[int, list[ExportedObservation]]]:
    unique = {
        observation.span_id: observation for call in calls for observation in call.observations
    }
    by_trace: dict[int, list[ExportedObservation]] = {}
    for observation in unique.values():
        by_trace.setdefault(observation.trace_id, []).append(observation)
    return sorted(
        by_trace.items(),
        key=lambda item: min(observation.start_time for observation in item[1]),
    )


def _count(observations: Sequence[ExportedObservation], observation_type: str) -> int:
    return sum(observation.observation_type == observation_type for observation in observations)


def _destination(config: TelemetryConfig) -> str:
    hostname = urlsplit(config.otlp.endpoint).hostname if config.otlp else None
    return "loopback (local test receiver)" if hostname in LOOPBACK_HOSTS else "remote HTTPS"


if __name__ == "__main__":
    main()
