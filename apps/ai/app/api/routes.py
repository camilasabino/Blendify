from fastapi import APIRouter, Depends, Request

from app.api.internal_auth import require_internal_token
from app.interpretation.intent_interpreter import IntentInterpreter
from app.interpretation.refinement_planner import RefinementPlanner
from app.models.interpretation import InterpretIntentRequest, InterpretIntentResponse
from app.models.refinement import PlanRefinementRequest, PlanRefinementResponse
from app.models.service import AiServiceHealth

router = APIRouter()


def _interpreter(request: Request) -> IntentInterpreter:
    return request.app.state.intent_interpreter


def _refinement_planner(request: Request) -> RefinementPlanner:
    return request.app.state.refinement_planner


@router.get("/health", response_model=AiServiceHealth)
def health(request: Request) -> AiServiceHealth:
    status = "available" if _interpreter(request).is_available else "unavailable"

    return AiServiceHealth.model_validate({"status": "ok", "intentInterpretation": status})


@router.post(
    "/v1/intent/interpret",
    response_model=InterpretIntentResponse,
    dependencies=[Depends(require_internal_token)],
)
async def interpret_intent(
    body: InterpretIntentRequest, request: Request
) -> InterpretIntentResponse:
    return await _interpreter(request).interpret(body)


@router.post(
    "/v1/refinement/plan",
    response_model=PlanRefinementResponse,
    dependencies=[Depends(require_internal_token)],
)
async def plan_refinement(body: PlanRefinementRequest, request: Request) -> PlanRefinementResponse:
    return await _refinement_planner(request).plan(body)
