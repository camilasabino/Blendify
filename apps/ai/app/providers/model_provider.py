from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal, Protocol

from pydantic import SecretStr

ModelConfigurationReason = Literal[
    "authentication",
    "permission_denied",
    "not_found",
    "bad_request",
    "unprocessable_request",
    "insufficient_quota",
]


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
    total_tokens: int


@dataclass(frozen=True, slots=True)
class ModelIntentResult:
    payload: Mapping[str, object]
    model: str
    usage: ModelTokenUsage | None


@dataclass(frozen=True, slots=True)
class ModelProviderConfig:
    model: str | None
    api_key: SecretStr | None
    timeout_seconds: float


class IntentModelProvider(Protocol):
    @property
    def name(self) -> str: ...

    @property
    def is_available(self) -> bool: ...

    async def generate_intent(self, request: ModelIntentRequest) -> ModelIntentResult: ...


class ModelProviderSetupError(Exception):
    pass


class ModelProviderError(Exception):
    pass


class ModelUnavailableError(ModelProviderError):
    pass


class ModelConfigurationError(ModelProviderError):
    def __init__(self, reason: ModelConfigurationReason) -> None:
        super().__init__(f"The model provider rejected the configuration: {reason}")
        self.reason: ModelConfigurationReason = reason


class ModelRateLimitedError(ModelProviderError):
    pass


class ModelTimeoutError(ModelProviderError):
    pass


class ModelInvalidOutputError(ModelProviderError):
    def __init__(
        self,
        message: str,
        *,
        model: str | None = None,
        usage: ModelTokenUsage | None = None,
    ) -> None:
        super().__init__(message)
        self.model = model
        self.usage = usage
