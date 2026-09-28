from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class ModelOutputSpec:
    name: str
    result_type: object


@dataclass(frozen=True, slots=True)
class ModelIntentRequest:
    prompt_version: str
    system_prompt: str
    user_prompt: str
    output: ModelOutputSpec


@dataclass(frozen=True, slots=True)
class ModelTokenUsage:
    input_tokens: int
    output_tokens: int


@dataclass(frozen=True, slots=True)
class ModelIntentResult:
    payload: Mapping[str, object]
    model: str
    usage: ModelTokenUsage | None


class IntentModelProvider(Protocol):
    @property
    def is_available(self) -> bool: ...

    async def generate_intent(self, request: ModelIntentRequest) -> ModelIntentResult: ...


class ModelProviderError(Exception):
    pass


class ModelUnavailableError(ModelProviderError):
    pass


class ModelConfigurationError(ModelProviderError):
    pass


class ModelRateLimitedError(ModelProviderError):
    pass


class ModelTimeoutError(ModelProviderError):
    pass


class ModelInvalidOutputError(ModelProviderError):
    pass
