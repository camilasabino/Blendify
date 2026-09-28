from app.interpretation.structured_model_call import (
    MAX_OUTPUT_VALIDATION_ATTEMPTS,
    MODEL_CALL_TIMEOUT_SECONDS,
    ModelCallEvents,
    StructuredModelCaller,
)
from app.models.refinement import (
    PlanRefinementRequest,
    PlanRefinementResponse,
    refinement_interpretation_adapter,
)
from app.prompts.refinement import build_refinement_model_request
from app.providers.model_provider import IntentModelProvider

REFINEMENT_EVENTS = ModelCallEvents(
    completed="refinement.planned",
    output_invalid="refinement.output_invalid",
    failed="refinement.failed",
    provider_misconfigured="refinement.provider_misconfigured",
)


class RefinementPlanner:
    def __init__(
        self,
        provider: IntentModelProvider,
        *,
        model_call_timeout_seconds: float = MODEL_CALL_TIMEOUT_SECONDS,
        max_output_validation_attempts: int = MAX_OUTPUT_VALIDATION_ATTEMPTS,
    ) -> None:
        self._caller = StructuredModelCaller(
            provider,
            model_call_timeout_seconds=model_call_timeout_seconds,
            max_output_validation_attempts=max_output_validation_attempts,
        )

    async def plan(self, request: PlanRefinementRequest) -> PlanRefinementResponse:
        model_request = build_refinement_model_request(request)
        result = await self._caller.call(
            model_request, refinement_interpretation_adapter, REFINEMENT_EVENTS
        )

        return PlanRefinementResponse.model_validate(
            {"promptVersion": model_request.prompt_version, "result": result}
        )
