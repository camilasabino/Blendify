from typing import Annotated

from pydantic import StringConstraints

from app.models.intent import IntentInterpretation
from app.models.wire import WireModel

AI_INTENT_PROMPT_MAX_LENGTH = 2_000
AI_PROMPT_VERSION_MAX_LENGTH = 64

UserPrompt = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=AI_INTENT_PROMPT_MAX_LENGTH),
]
PromptVersion = Annotated[
    str, StringConstraints(min_length=1, max_length=AI_PROMPT_VERSION_MAX_LENGTH)
]


class InterpretIntentRequest(WireModel):
    prompt: UserPrompt


class InterpretIntentResponse(WireModel):
    prompt_version: PromptVersion
    result: IntentInterpretation
