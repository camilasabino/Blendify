import logging

from fastapi import FastAPI

from app.api.error_handlers import register_error_handlers
from app.api.routes import router
from app.config.settings import Settings, load_settings
from app.interpretation.intent_interpreter import IntentInterpreter
from app.interpretation.refinement_planner import RefinementPlanner
from app.interpretation.structured_model_call import MODEL_CALL_TIMEOUT_SECONDS
from app.observability.request_correlation import RequestCorrelationMiddleware
from app.providers.model_provider import IntentModelProvider
from app.providers.registry import build_model_provider


def create_app(
    settings: Settings | None = None,
    provider: IntentModelProvider | None = None,
) -> FastAPI:
    resolved_settings = settings or load_settings()
    logging.basicConfig(level=logging.INFO)

    app = FastAPI(
        title="Blendify AI service",
        docs_url=None if resolved_settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if resolved_settings.is_production else "/openapi.json",
    )
    model_provider = provider or build_model_provider(resolved_settings, MODEL_CALL_TIMEOUT_SECONDS)
    app.state.settings = resolved_settings.model_copy(update={"provider_api_key": None})
    app.state.intent_interpreter = IntentInterpreter(model_provider)
    app.state.refinement_planner = RefinementPlanner(model_provider)

    app.add_middleware(RequestCorrelationMiddleware)
    register_error_handlers(app)
    app.include_router(router)

    return app
