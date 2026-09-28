import { isDeepStrictEqual } from 'node:util';
import type {
  AiRefinementClarificationReason,
  AiSeedType,
} from '@blendify/contracts';
import type { RefinementInterpretation } from '@blendify/contracts/ai-service';
import { constraintCapability } from './ai-capability-matrix';
import type {
  AiIntent,
  AiIntentClarification,
  AiUnsupportedConstraint,
} from './ai-intent';
import {
  applyIntentPatch,
  applyPreservationPatch,
  conflictingPatchLabels,
  type AiPreservation,
} from './ai-intent-patch';
import { findIntentClarification, normalizeAiIntent } from './ai-intent-rules';

export interface AiRefinementClarification {
  reason: AiRefinementClarificationReason;
  seedType: AiSeedType | null;
  limit: number | null;
  names: string[];
  unsupportedConstraints: AiUnsupportedConstraint[];
}

export type AiRefinementEvaluation =
  | {
      status: 'proposed';
      intent: AiIntent;
      preservation: AiPreservation;
      notApplied: AiUnsupportedConstraint[];
    }
  | { status: 'needs_clarification'; clarification: AiRefinementClarification }
  | { status: 'unchanged' };

export interface AiRefinementInput {
  intent: AiIntent;
  preservation: AiPreservation;
  interpretation: RefinementInterpretation;
  playlistTrackCount: number;
}

export function evaluateRefinement(
  input: AiRefinementInput,
): AiRefinementEvaluation {
  const { interpretation } = input;

  if (interpretation.outcome === 'needs_clarification') {
    return clarify(interpretation.clarification.reason, {
      unsupportedConstraints:
        interpretation.clarification.unsupportedConstraints,
    });
  }

  const conflicts = conflictingPatchLabels(
    interpretation.patch,
    interpretation.preservation,
  );
  if (conflicts.length > 0) {
    return clarify('conflicting_changes', { names: conflicts });
  }

  const blocking = interpretation.unsupportedConstraints.filter(
    (constraint) =>
      constraintCapability(constraint.category) === 'needs_clarification',
  );
  if (blocking.length > 0) {
    return clarify('unsupported_constraint', {
      unsupportedConstraints: blocking,
    });
  }

  const intent = normalizeAiIntent(
    applyIntentPatch(input.intent, interpretation.patch),
  );
  const intentClarification = findIntentClarification(intent);
  if (intentClarification) {
    return fromIntentClarification(intentClarification);
  }

  const preservation = applyPreservationPatch(
    input.preservation,
    interpretation.preservation,
  );
  if (!fitsPlaylist(preservation, input.playlistTrackCount)) {
    return clarify('preserved_track_out_of_range', {
      limit: input.playlistTrackCount,
    });
  }

  const notApplied = interpretation.unsupportedConstraints;
  const changed =
    !isDeepStrictEqual(intent, input.intent) ||
    !isDeepStrictEqual(preservation, input.preservation);
  if (changed) {
    return { status: 'proposed', intent, preservation, notApplied };
  }
  if (notApplied.length > 0) {
    return clarify('unsupported_constraint', {
      unsupportedConstraints: notApplied,
    });
  }
  return { status: 'unchanged' };
}

function fitsPlaylist(
  preservation: AiPreservation,
  playlistTrackCount: number,
): boolean {
  const positions = [
    ...preservation.positions,
    ...(preservation.firstTracks === null ? [] : [preservation.firstTracks]),
  ];
  return positions.every((position) => position <= playlistTrackCount);
}

function fromIntentClarification(
  clarification: AiIntentClarification,
): AiRefinementEvaluation {
  return clarify(clarification.reason, {
    seedType: clarification.seedType,
    limit: clarification.limit,
    names: clarification.names,
    unsupportedConstraints: clarification.unsupportedConstraints,
  });
}

function clarify(
  reason: AiRefinementClarificationReason,
  details: Partial<Omit<AiRefinementClarification, 'reason'>> = {},
): AiRefinementEvaluation {
  return {
    status: 'needs_clarification',
    clarification: {
      reason,
      seedType: details.seedType ?? null,
      limit: details.limit ?? null,
      names: details.names ?? [],
      unsupportedConstraints: details.unsupportedConstraints ?? [],
    },
  };
}
