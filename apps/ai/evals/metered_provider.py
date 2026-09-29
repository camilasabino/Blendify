import time
from dataclasses import dataclass

from app.providers.model_provider import (
    IntentModelProvider,
    ModelIntentRequest,
    ModelIntentResult,
    ModelInvalidOutputError,
    ModelTokenUsage,
)


class ProviderRequestBudgetExceededError(Exception):
    pass


@dataclass(frozen=True, slots=True)
class ProviderRequestRecord:
    latency_ms: int
    model: str | None
    usage: ModelTokenUsage | None


class MeteredModelProvider:
    def __init__(self, provider: IntentModelProvider, *, request_budget: int) -> None:
        self._provider = provider
        self._request_budget = request_budget
        self.request_count = 0
        self.records: list[ProviderRequestRecord] = []

    @property
    def name(self) -> str:
        return self._provider.name

    @property
    def is_available(self) -> bool:
        return self._provider.is_available

    async def generate_intent(self, request: ModelIntentRequest) -> ModelIntentResult:
        if self.request_count >= self._request_budget:
            raise ProviderRequestBudgetExceededError(
                f"The run reached its budget of {self._request_budget} provider requests"
            )

        self.request_count += 1
        started_at = time.monotonic()
        model: str | None = None
        usage: ModelTokenUsage | None = None
        try:
            result = await self._provider.generate_intent(request)
            model, usage = result.model, result.usage
            return result
        except ModelInvalidOutputError as error:
            model, usage = error.model, error.usage
            raise
        finally:
            latency_ms = round((time.monotonic() - started_at) * 1000)
            self.records.append(
                ProviderRequestRecord(latency_ms=latency_ms, model=model, usage=usage)
            )
