import type { AiGenerationUnmetConstraint } from '@blendify/contracts';
import { isDurationWithinTolerance } from './ai-target-duration';

export function unmetGenerationConstraints(input: {
  targetTrackCount: number | null;
  targetDurationMinutes: number | null;
  trackCount: number;
  durationMs: number;
}): AiGenerationUnmetConstraint[] {
  const unmet: AiGenerationUnmetConstraint[] = [];

  if (
    input.targetTrackCount !== null &&
    input.trackCount < input.targetTrackCount
  ) {
    unmet.push({
      type: 'track_count',
      requested: input.targetTrackCount,
      actual: input.trackCount,
    });
  }
  if (
    input.targetDurationMinutes !== null &&
    !isDurationWithinTolerance(input.durationMs, input.targetDurationMinutes)
  ) {
    unmet.push({
      type: 'duration',
      requestedMinutes: input.targetDurationMinutes,
      actualDurationMs: input.durationMs,
    });
  }
  return unmet;
}
