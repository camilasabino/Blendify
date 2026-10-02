import logging
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager

from fastapi import FastAPI

from app.api.error_handlers import register_error_handlers
from app.api.routes import HEALTH_PATH, router
from app.config.settings import Settings, load_settings
from app.interpretation.intent_interpreter import IntentInterpreter
from app.interpretation.refinement_planner import RefinementPlanner
from app.interpretation.structured_model_call import MODEL_CALL_TIMEOUT_SECONDS
from app.observability.request_correlation import RequestCorrelationMiddleware
from app.observability.request_tracing import instrument_requests
from app.observability.telemetry_config import load_telemetry_config
from app.observability.telemetry_runtime import TelemetryRuntime, build_telemetry_runtime
from app.providers.model_provider import IntentModelProvider
from app.providers.registry import build_model_provider


def create_app(
    settings: Settings | None = None,
    provider: IntentModelProvider | None = None,
    telemetry: TelemetryRuntime | None = None,
) -> FastAPI:
    resolved_settings = settings or load_settings()
    telemetry_runtime = telemetry or build_telemetry_runtime(
        load_telemetry_config(), resolved_settings.environment
    )
    logging.basicConfig(level=logging.INFO)

    app = FastAPI(
        title="Blendify AI service",
        docs_url=None if resolved_settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if resolved_settings.is_production else "/openapi.json",
        lifespan=_telemetry_lifespan(telemetry_runtime),
    )
    model_provider = provider or build_model_provider(resolved_settings, MODEL_CALL_TIMEOUT_SECONDS)
    app.state.settings = resolved_settings.model_copy(update={"provider_api_key": None})
    tracer_provider = telemetry_runtime.tracer_provider
    app.state.intent_interpreter = IntentInterpreter(
        model_provider, tracer_provider=tracer_provider
    )
    app.state.refinement_planner = RefinementPlanner(
        model_provider, tracer_provider=tracer_provider
    )

    app.add_middleware(RequestCorrelationMiddleware)
    register_error_handlers(app)
    app.include_router(router)
    instrument_requests(app, telemetry_runtime, untraced_paths=[HEALTH_PATH])

    return app


def _telemetry_lifespan(
    runtime: TelemetryRuntime,
) -> Callable[[FastAPI], AbstractAsyncContextManager[None]]:
    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        runtime.start()
        try:
            yield
        finally:
            runtime.shutdown()

    return lifespan
