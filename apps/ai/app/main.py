import logging

from fastapi import FastAPI

from app.api.error_handlers import register_error_handlers
from app.api.routes import router
from app.config.settings import Settings, load_settings
from app.interpretation.intent_interpreter import MODEL_CALL_TIMEOUT_SECONDS, IntentInterpreter
from app.providers.model_provider import IntentModelProvider
from app.providers.selection import select_model_provider

SDK_LOGGER_NAMES = ("openai",)


def create_app(
    settings: Settings | None = None,
    provider: IntentModelProvider | None = None,
) -> FastAPI:
    resolved_settings = settings or load_settings()
    logging.basicConfig(level=logging.INFO)
    # SDK debug logs include request bodies, which carry the user's prompt.
    for logger_name in SDK_LOGGER_NAMES:
        logging.getLogger(logger_name).setLevel(logging.WARNING)

    app = FastAPI(
        title="Blendify AI service",
        docs_url=None if resolved_settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if resolved_settings.is_production else "/openapi.json",
    )
    app.state.settings = resolved_settings
    app.state.intent_interpreter = IntentInterpreter(
        provider or select_model_provider(resolved_settings, MODEL_CALL_TIMEOUT_SECONDS)
    )

    register_error_handlers(app)
    app.include_router(router)

    return app
