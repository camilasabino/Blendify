import json
from collections.abc import Mapping

import httpx2
import openai
from openai import AsyncOpenAI
from openai.types.responses import Response

from app.providers.model_provider import (
    ModelConfigurationError,
    ModelIntentRequest,
    ModelIntentResult,
    ModelInvalidOutputError,
    ModelOutputSpec,
    ModelRateLimitedError,
    ModelTimeoutError,
    ModelTokenUsage,
    ModelUnavailableError,
)
from app.providers.openai_output_schema import (
    MODEL_OUTPUT_RESULT_FIELD,
    JsonSchema,
    build_model_output_schema,
)

MODEL_MAX_OUTPUT_TOKENS = 4_000
INSUFFICIENT_QUOTA_ERROR_CODE = "insufficient_quota"

CONFIGURATION_ERRORS: tuple[type[openai.APIStatusError], ...] = (
    openai.AuthenticationError,
    openai.PermissionDeniedError,
    openai.NotFoundError,
    openai.BadRequestError,
    openai.UnprocessableEntityError,
)


class OpenAIIntentModelProvider:
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        timeout_seconds: float,
        http_client: httpx2.AsyncClient | None = None,
    ) -> None:
        self._model = model
        self._output_schemas: dict[str, JsonSchema] = {}
        self._client = AsyncOpenAI(
            api_key=api_key,
            timeout=timeout_seconds,
            max_retries=0,
            http_client=http_client,
        )

    @property
    def is_available(self) -> bool:
        return True

    async def generate_intent(self, request: ModelIntentRequest) -> ModelIntentResult:
        try:
            response = await self._client.responses.create(
                model=self._model,
                instructions=request.system_prompt,
                input=request.user_prompt,
                max_output_tokens=MODEL_MAX_OUTPUT_TOKENS,
                store=False,
                text={
                    "format": {
                        "type": "json_schema",
                        "name": request.output.name,
                        "strict": True,
                        "schema": self._output_schema(request.output),
                    }
                },
            )
        except openai.APIError as error:
            raise _to_provider_error(error) from None

        return ModelIntentResult(
            payload=_structured_payload(response),
            model=response.model,
            usage=_token_usage(response),
        )

    def _output_schema(self, output: ModelOutputSpec) -> JsonSchema:
        if output.name not in self._output_schemas:
            self._output_schemas[output.name] = build_model_output_schema(output.result_type)
        return self._output_schemas[output.name]


def _to_provider_error(error: openai.APIError) -> Exception:
    if isinstance(error, openai.APITimeoutError):
        return ModelTimeoutError("The model provider timed out")
    if isinstance(error, openai.RateLimitError):
        if error.code == INSUFFICIENT_QUOTA_ERROR_CODE:
            return ModelConfigurationError("The model provider account has no quota")
        return ModelRateLimitedError("The model provider is rate limiting requests")
    if isinstance(error, CONFIGURATION_ERRORS):
        return ModelConfigurationError(f"The model provider rejected the request: {error.code}")
    return ModelUnavailableError(f"The model provider is unavailable: {type(error).__name__}")


def _structured_payload(response: Response) -> Mapping[str, object]:
    if response.status != "completed":
        raise ModelInvalidOutputError(f"The model response is {response.status}")
    if _has_refusal(response):
        raise ModelInvalidOutputError("The model refused to answer")

    try:
        decoded = json.loads(response.output_text)
    except json.JSONDecodeError:
        raise ModelInvalidOutputError("The model output is not JSON") from None

    result = decoded.get(MODEL_OUTPUT_RESULT_FIELD) if isinstance(decoded, dict) else None
    if not isinstance(result, dict):
        raise ModelInvalidOutputError("The model output has no result object")
    return result


def _has_refusal(response: Response) -> bool:
    return any(
        content.type == "refusal"
        for output in response.output
        if output.type == "message"
        for content in output.content
    )


def _token_usage(response: Response) -> ModelTokenUsage | None:
    if response.usage is None:
        return None
    return ModelTokenUsage(
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
    )
