import {
  AI_INTENT_TARGET_DURATION_MINUTES_MAX,
  type IntentPatch,
  type NameListPatch,
  type PositionListPatch,
  type PreservationConstraints,
  type PreservationPatch,
  type TrackListPatch,
} from '@blendify/contracts/ai-service';
import type { AiIntent, AiTrackReference } from './ai-intent';
import { aiGenreKey } from './ai-genre-seeds';
import {
  MIN_TARGET_DURATION_MINUTES,
  aiNameKey,
  aiTrackKey,
} from './ai-intent-rules';

export type AiIntentPatch = IntentPatch;
export type AbsoluteAiIntentPatch = Omit<
  AiIntentPatch,
  'targetDurationMinutes'
> & {
  targetDurationMinutes: Exclude<
    AiIntentPatch['targetDurationMinutes'],
    { operation: 'adjust' }
  >;
};
export type RelativeDurationResolution =
  | { status: 'resolved'; patch: AbsoluteAiIntentPatch }
  | { status: 'no_target' }
  | { status: 'out_of_range' };
export type AiPreservation = PreservationConstraints;
export type AiPreservationPatch = PreservationPatch;

export const EMPTY_AI_PRESERVATION: AiPreservation = {
  firstTracks: null,
  positions: [],
  artists: [],
};

type ValuePatch<T> =
  { operation: 'set'; value: T } | { operation: 'clear' } | null;

export function resolveRelativeDuration(
  intent: AiIntent,
  patch: AiIntentPatch,
): RelativeDurationResolution {
  const { targetDurationMinutes } = patch;
  if (targetDurationMinutes?.operation !== 'adjust') {
    return {
      status: 'resolved',
      patch: { ...patch, targetDurationMinutes },
    };
  }
  if (intent.targetDurationMinutes === null) {
    return { status: 'no_target' };
  }

  const minutes =
    intent.targetDurationMinutes + targetDurationMinutes.deltaMinutes;
  if (
    minutes < MIN_TARGET_DURATION_MINUTES ||
    minutes > AI_INTENT_TARGET_DURATION_MINUTES_MAX
  ) {
    return { status: 'out_of_range' };
  }
  return {
    status: 'resolved',
    patch: {
      ...patch,
      targetDurationMinutes: { operation: 'set', value: minutes },
    },
  };
}

export function applyIntentPatch(
  intent: AiIntent,
  patch: AbsoluteAiIntentPatch,
): AiIntent {
  return {
    ...intent,
    kind: patch.kind?.value ?? intent.kind,
    artists: applyNames(intent.artists, patch.artists),
    genres: applyNames(intent.genres, patch.genres, aiGenreKey),
    seedTracks: applyTracks(intent.seedTracks, patch.seedTracks),
    filters: {
      region: applyValue(intent.filters.region, patch.filters.region),
      femaleVocals: applyFlag(
        intent.filters.femaleVocals,
        patch.filters.femaleVocals,
      ),
      releaseRange: applyValue(
        intent.filters.releaseRange,
        patch.filters.releaseRange,
      ),
      excludeLive: applyFlag(
        intent.filters.excludeLive,
        patch.filters.excludeLive,
      ),
    },
    targetTrackCount: applyValue(
      intent.targetTrackCount,
      patch.targetTrackCount,
    ),
    targetDurationMinutes: applyValue(
      intent.targetDurationMinutes,
      patch.targetDurationMinutes,
    ),
    mood: applyValue(intent.mood, patch.mood),
    popularity: applyValue(intent.popularity, patch.popularity),
    orderMode: applyValue(intent.orderMode, patch.orderMode),
    excludeArtists: applyNames(intent.excludeArtists, patch.excludeArtists),
    excludeTracks: applyTracks(intent.excludeTracks, patch.excludeTracks),
  };
}

export function applyPreservationPatch(
  preservation: AiPreservation,
  patch: AiPreservationPatch,
): AiPreservation {
  return {
    firstTracks: applyValue(preservation.firstTracks, patch.firstTracks),
    positions: applyPositions(preservation.positions, patch.positions),
    artists: uniqueByKey(
      applyNames(preservation.artists, patch.artists),
      aiNameKey,
    ),
  };
}

export function conflictingPatchLabels(
  patch: AiIntentPatch,
  preservation: AiPreservationPatch,
): string[] {
  return [
    ...nameConflicts(patch.artists),
    ...nameConflicts(patch.genres, aiGenreKey),
    ...trackConflicts(patch.seedTracks),
    ...nameConflicts(patch.excludeArtists),
    ...trackConflicts(patch.excludeTracks),
    ...positionConflicts(preservation.positions),
    ...nameConflicts(preservation.artists),
  ];
}

function applyValue<T>(current: T | null, patch: ValuePatch<T>): T | null {
  if (patch === null) {
    return current;
  }
  return patch.operation === 'set' ? patch.value : null;
}

function applyFlag(current: boolean, patch: ValuePatch<true>): boolean {
  if (patch === null) {
    return current;
  }
  return patch.operation === 'set';
}

function applyNames(
  current: string[],
  patch: NameListPatch,
  keyOf: (name: string) => string = aiNameKey,
): string[] {
  const removed = new Set(patch.remove.map(keyOf));
  const kept = current.filter((name) => !removed.has(keyOf(name)));

  return uniqueByKey([...kept, ...patch.add], keyOf);
}

function applyTracks(
  current: AiTrackReference[],
  patch: TrackListPatch,
): AiTrackReference[] {
  const kept = current.filter(
    (track) => !patch.remove.some((removed) => sameTrack(track, removed)),
  );

  return uniqueByKey([...kept, ...patch.add], aiTrackKey);
}

function applyPositions(current: number[], patch: PositionListPatch): number[] {
  const removed = new Set(patch.remove);
  const positions = new Set(
    [...current, ...patch.add].filter((position) => !removed.has(position)),
  );

  return [...positions].sort((left, right) => left - right);
}

function sameTrack(
  track: AiTrackReference,
  removed: AiTrackReference,
): boolean {
  if (removed.artist === null) {
    return aiNameKey(track.title) === aiNameKey(removed.title);
  }
  return aiTrackKey(track) === aiTrackKey(removed);
}

function uniqueByKey<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function nameConflicts(
  patch: NameListPatch,
  keyOf: (name: string) => string = aiNameKey,
): string[] {
  const removed = new Set(patch.remove.map(keyOf));
  return patch.add.filter((name) => removed.has(keyOf(name)));
}

function trackConflicts(patch: TrackListPatch): string[] {
  return patch.add
    .filter((track) =>
      patch.remove.some((removed) => sameTrack(track, removed)),
    )
    .map((track) => track.title);
}

function positionConflicts(patch: PositionListPatch): string[] {
  const removed = new Set(patch.remove);
  return patch.add
    .filter((position) => removed.has(position))
    .map((position) => String(position));
}
