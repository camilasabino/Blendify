import type {
  PlanRefinementRequest,
  PlanRefinementResponse,
} from '@blendify/contracts/ai-service';

export const REFINEMENT_PLANNER = 'REFINEMENT_PLANNER' as const;

export type AiSafeRefinementRequest = PlanRefinementRequest;
export type RefinementPlanResult = PlanRefinementResponse;

export interface RefinementPlannerPort {
  planRefinement(
    request: AiSafeRefinementRequest,
  ): Promise<RefinementPlanResult>;
}
