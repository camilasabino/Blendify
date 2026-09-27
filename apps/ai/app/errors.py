from app.models.service import AiServiceErrorCode

AI_SERVICE_ERROR_MESSAGES: dict[AiServiceErrorCode, str] = {
    "INVALID_REQUEST": "The request does not match the AI service contract.",
    "UNAUTHORIZED": "The request is not authenticated for the AI service.",
    "NOT_FOUND": "The requested AI service route does not exist.",
    "MODEL_UNAVAILABLE": "Intent interpretation is not available.",
    "MODEL_RATE_LIMITED": "The model provider is rate limiting requests.",
    "MODEL_TIMEOUT": "The model provider did not respond in time.",
    "INVALID_MODEL_OUTPUT": "The model did not return a valid structured intent.",
    "INTERNAL_ERROR": "The AI service failed unexpectedly.",
}


class AiServiceError(Exception):
    def __init__(self, code: AiServiceErrorCode) -> None:
        super().__init__(AI_SERVICE_ERROR_MESSAGES[code])
        self.code: AiServiceErrorCode = code
        self.message = AI_SERVICE_ERROR_MESSAGES[code]
