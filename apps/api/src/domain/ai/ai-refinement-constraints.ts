import type { AiGenerationUnmetConstraint } from '@blendify/contracts';
import type { AiIntent } from './ai-intent';
import type { AiGenerationResult } from './ai-session';
import { durationDistanceMs } from './ai-target-duration';
import { unmetGenerationConstraints } from './ai-unmet-constraints';

export function unsatisfiedRefinementConstraints(input: {
  intent: AiIntent;
  current: AiGenerationResult;
  candidate: AiGenerationResult;
}): AiGenerationUnmetConstraint[] {
  const { intent, current, candidate } = input;

  return unmetGenerationConstraints({
    targetTrackCount: intent.targetTrackCount,
    targetDurationMinutes: intent.targetDurationMinutes,
    trackCount: candidate.playlist.tracks.length,
    durationMs: candidate.durationMs,
  }).filter((unmet) => !isInherited(unmet, current.unmetConstraints));
}

function isInherited(
  unmet: AiGenerationUnmetConstraint,
  previous: readonly AiGenerationUnmetConstraint[],
): boolean {
  return previous.some((prior) => {
    if (unmet.type === 'track_count' && prior.type === 'track_count') {
      return (
        prior.requested === unmet.requested && unmet.actual >= prior.actual
      );
    }
    if (unmet.type === 'duration' && prior.type === 'duration') {
      return (
        prior.requestedMinutes === unmet.requestedMinutes &&
        durationDistanceMs(unmet.actualDurationMs, unmet.requestedMinutes) <=
          durationDistanceMs(prior.actualDurationMs, prior.requestedMinutes)
      );
    }
    return false;
  });
}
