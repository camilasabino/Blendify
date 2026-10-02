from opentelemetry.trace import TracerProvider

from app.interpretation.structured_model_call import (
    MAX_OUTPUT_VALIDATION_ATTEMPTS,
    MODEL_CALL_TIMEOUT_SECONDS,
    StructuredModelCaller,
)
from app.models.refinement import (
    PlanRefinementRequest,
    PlanRefinementResponse,
    refinement_interpretation_adapter,
)
from app.prompts.refinement import build_refinement_model_request
from app.providers.model_provider import IntentModelProvider


class RefinementPlanner:
    def __init__(
        self,
        provider: IntentModelProvider,
        *,
        model_call_timeout_seconds: float = MODEL_CALL_TIMEOUT_SECONDS,
        max_output_validation_attempts: int = MAX_OUTPUT_VALIDATION_ATTEMPTS,
        tracer_provider: TracerProvider | None = None,
    ) -> None:
        self._caller = StructuredModelCaller(
            provider,
            operation="refinement_interpretation",
            model_call_timeout_seconds=model_call_timeout_seconds,
            max_output_validation_attempts=max_output_validation_attempts,
            tracer_provider=tracer_provider,
        )

    async def plan(self, request: PlanRefinementRequest) -> PlanRefinementResponse:
        model_request = build_refinement_model_request(request)
        result = await self._caller.call(model_request, refinement_interpretation_adapter)

        return PlanRefinementResponse.model_validate(
            {"promptVersion": model_request.prompt_version, "result": result}
        )
