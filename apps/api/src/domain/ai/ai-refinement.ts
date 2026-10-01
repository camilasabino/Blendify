import type {
  AiRefinementClarificationReason,
  AiSeedType,
} from '@blendify/contracts';
import type {
  PositionListPatch,
  PreservationPatch,
  RefinementInterpretation,
} from '@blendify/contracts/ai-service';
import { constraintCapability } from './ai-capability-matrix';
import { isSameEffectiveState } from './ai-effective-state';
import { isCatalogGenreName } from './ai-genre-seeds';
import type {
  AiIntent,
  AiIntentClarification,
  AiUnsupportedConstraint,
} from './ai-intent';
import {
  applyIntentPatch,
  applyPreservationPatch,
  conflictingPatchLabels,
  resolveRelativeDuration,
  type AiPreservation,
} from './ai-intent-patch';
import { findIntentClarification, normalizeAiIntent } from './ai-intent-rules';
import { withCanonicalPatchRegion } from './ai-selection-filters';

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
  explicitPositions?: PositionListPatch;
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

  const preservationPatch = withExplicitPositions(
    interpretation.preservation,
    input.explicitPositions,
  );
  const conflicts = conflictingPatchLabels(
    interpretation.patch,
    preservationPatch,
  );
  if (conflicts.length > 0) {
    return clarify('conflicting_changes', { names: conflicts });
  }

  const blocking = [
    ...interpretation.unsupportedConstraints.filter(
      (constraint) => constraintCapability(constraint.category) !== 'deferred',
    ),
    ...genreExclusions(interpretation.patch.excludeArtists.add),
  ];
  if (blocking.length > 0) {
    return clarify('unsupported_constraint', {
      unsupportedConstraints: blocking,
    });
  }

  const current = normalizeAiIntent(input.intent);
  const duration = resolveRelativeDuration(current, interpretation.patch);
  if (duration.status === 'no_target') {
    return clarify('ambiguous_request');
  }
  if (duration.status === 'out_of_range') {
    return clarify('invalid_duration');
  }

  const intent = normalizeAiIntent(
    applyIntentPatch(
      current,
      withCanonicalPatchRegion(current, duration.patch),
    ),
  );
  const intentClarification = findIntentClarification(intent);
  if (intentClarification) {
    return fromIntentClarification(intentClarification);
  }

  const preservation = applyPreservationPatch(
    input.preservation,
    preservationPatch,
  );
  if (!fitsPlaylist(preservation, input.playlistTrackCount)) {
    return clarify('preserved_track_out_of_range', {
      limit: input.playlistTrackCount,
    });
  }

  const notApplied = interpretation.unsupportedConstraints;
  const changed = !isSameEffectiveState(
    { intent, preservation },
    { intent: current, preservation: input.preservation },
  );
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

function genreExclusions(excludedArtists: string[]): AiUnsupportedConstraint[] {
  return excludedArtists
    .filter(isCatalogGenreName)
    .map((name) => ({ category: 'genre_exclusion', userText: name }));
}

function withExplicitPositions(
  patch: PreservationPatch,
  explicit: PositionListPatch | undefined,
): PreservationPatch {
  if (!explicit) {
    return patch;
  }
  return {
    ...patch,
    positions: {
      add: uniquePositions([...patch.positions.add, ...explicit.add]),
      remove: uniquePositions([...patch.positions.remove, ...explicit.remove]),
    },
  };
}

function uniquePositions(positions: number[]): number[] {
  return [...new Set(positions)];
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
