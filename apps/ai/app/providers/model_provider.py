from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class ModelIntentRequest:
    prompt_version: str
    system_prompt: str
    user_prompt: str


class IntentModelProvider(Protocol):
    @property
    def is_available(self) -> bool: ...

    async def generate_intent(self, request: ModelIntentRequest) -> Mapping[str, object]: ...


class ModelProviderError(Exception):
    pass


class ModelUnavailableError(ModelProviderError):
    pass


class ModelRateLimitedError(ModelProviderError):
    pass


class ModelTimeoutError(ModelProviderError):
    pass
