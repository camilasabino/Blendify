import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from app.errors import AiServiceError
from app.models.service import AiServiceErrorCode, AiServiceErrorResponse

HTTP_STATUS_BY_ERROR_CODE: dict[AiServiceErrorCode, int] = {
    "INVALID_REQUEST": 422,
    "UNAUTHORIZED": 401,
    "NOT_FOUND": 404,
    "MODEL_UNAVAILABLE": 503,
    "MODEL_RATE_LIMITED": 429,
    "MODEL_TIMEOUT": 504,
    "INVALID_MODEL_OUTPUT": 502,
    "INTERNAL_ERROR": 500,
}

logger = logging.getLogger(__name__)


def error_response(code: AiServiceErrorCode) -> JSONResponse:
    error = AiServiceError(code)
    body = AiServiceErrorResponse(code=error.code, message=error.message)

    return JSONResponse(status_code=HTTP_STATUS_BY_ERROR_CODE[code], content=body.model_dump())


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AiServiceError)
    async def handle_service_error(_request: Request, error: AiServiceError) -> JSONResponse:
        return error_response(error.code)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        _request: Request, _error: RequestValidationError
    ) -> JSONResponse:
        return error_response("INVALID_REQUEST")

    @app.exception_handler(HTTPException)
    async def handle_http_error(_request: Request, error: HTTPException) -> JSONResponse:
        if error.status_code == 404:
            return error_response("NOT_FOUND")
        if error.status_code < 500:
            return error_response("INVALID_REQUEST")
        return error_response("INTERNAL_ERROR")

    @app.exception_handler(Exception)
    async def handle_unexpected_error(_request: Request, error: Exception) -> JSONResponse:
        logger.error("Unhandled AI service error: %s", type(error).__name__)
        return error_response("INTERNAL_ERROR")
