import re
from collections.abc import Iterable

from fastapi import FastAPI
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.metrics import NoOpMeterProvider
from opentelemetry.trace import Span
from starlette.types import Scope

from app.observability.request_correlation import incoming_request_id
from app.observability.span_privacy import REQUEST_ID_ATTRIBUTE
from app.observability.telemetry_runtime import TelemetryRuntime


def instrument_requests(
    app: FastAPI, runtime: TelemetryRuntime, untraced_paths: Iterable[str]
) -> None:
    if not runtime.is_enabled:
        return

    FastAPIInstrumentor.instrument_app(
        app,
        server_request_hook=_record_request_id,
        tracer_provider=runtime.tracer_provider,
        meter_provider=NoOpMeterProvider(),
        excluded_urls=_whole_path_patterns([*untraced_paths, *_documentation_paths(app)]),
        exclude_spans=["receive", "send"],
    )


def _documentation_paths(app: FastAPI) -> list[str]:
    paths = [app.openapi_url, app.docs_url]
    if app.docs_url:
        paths.append(app.swagger_ui_oauth2_redirect_url)
    return [path for path in paths if path]


def _whole_path_patterns(paths: Iterable[str]) -> str:
    return ",".join(f"^[a-z]+://[^/?#]*{re.escape(path)}$" for path in paths)


def _record_request_id(span: Span, scope: Scope) -> None:
    request_id = incoming_request_id(scope)
    if request_id is not None:
        span.set_attribute(REQUEST_ID_ATTRIBUTE, request_id)
