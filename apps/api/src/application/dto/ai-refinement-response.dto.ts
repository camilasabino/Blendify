import type {
  AiRefinementDto,
  AiRefinementResultDto,
} from '@blendify/contracts';
import type { AiPendingRefinement, AiSession } from '@/domain/ai/ai-session';
import { toGeneratedPreview, toIntentSummary } from './ai-session-response.dto';

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

export function toRefinement(pending: AiPendingRefinement): AiRefinementDto {
  switch (pending.status) {
    case 'proposed': {
      const proposal = {
        intent: toIntentSummary(pending.aiSafe.intent),
        preservation: pending.aiSafe.preservation,
        notApplied: pending.aiSafe.notApplied,
      };
      const { candidate } = pending;
      if (candidate.status === 'failed') {
        return {
          id: pending.id,
          status: 'candidate_failed',
          ...proposal,
          error: { ...candidate.failure },
        };
      }
      return {
        id: pending.id,
        status: 'candidate_ready',
        ...proposal,
        candidate: toGeneratedPreview(candidate.result),
        diff: {
          tracks: candidate.diff.tracks,
          intent: candidate.diff.intent,
          preservedPositions: candidate.preservedPositions,
        },
      };
    }
    case 'needs_clarification':
      return {
        id: pending.id,
        status: 'needs_clarification',
        clarification: pending.clarification,
      };
    case 'unchanged':
      return { id: pending.id, status: 'unchanged' };
  }
}
