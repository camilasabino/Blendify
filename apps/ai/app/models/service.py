from typing import Annotated, Literal

from pydantic import StringConstraints

from app.models.wire import WireModel

AI_SERVICE_ERROR_MESSAGE_MAX_LENGTH = 300

AiServiceErrorCode = Literal[
    "INVALID_REQUEST",
    "UNAUTHORIZED",
    "NOT_FOUND",
    "MODEL_UNAVAILABLE",
    "MODEL_RATE_LIMITED",
    "MODEL_TIMEOUT",
    "INVALID_MODEL_OUTPUT",
    "INTERNAL_ERROR",
]
IntentInterpretationStatus = Literal["available", "unavailable"]


class AiServiceErrorResponse(WireModel):
    code: AiServiceErrorCode
    message: Annotated[
        str, StringConstraints(min_length=1, max_length=AI_SERVICE_ERROR_MESSAGE_MAX_LENGTH)
    ]


class AiServiceHealth(WireModel):
    status: Literal["ok"]
    intent_interpretation: IntentInterpretationStatus
