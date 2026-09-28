import type {
  AiRefinementDto,
  AiRefinementResultDto,
} from '@blendify/contracts';
import type { AiPendingRefinement, AiSession } from '@/domain/ai/ai-session';
import { toIntentSummary } from './ai-session-response.dto';

export function toAiRefinementResponse(
  token: string,
  session: AiSession,
): AiRefinementResultDto {
  if (!session.pendingRefinement) {
    throw new Error('A refinement response needs a pending refinement.');
  }

  return {
    sessionId: token,
    expiresAt: session.expiresAt,
    refinement: toRefinement(session.pendingRefinement),
  };
}

function toRefinement(pending: AiPendingRefinement): AiRefinementDto {
  switch (pending.status) {
    case 'proposed':
      return {
        status: 'proposed',
        intent: toIntentSummary(pending.aiSafe.intent),
        preservation: pending.aiSafe.preservation,
        notApplied: pending.aiSafe.notApplied,
      };
    case 'needs_clarification':
      return {
        status: 'needs_clarification',
        clarification: pending.clarification,
      };
    case 'unchanged':
      return { status: 'unchanged' };
  }
}
