import type {
  IntentPatch,
  NameListPatch,
  PositionListPatch,
  PreservationConstraints,
  PreservationPatch,
  TrackListPatch,
} from '@blendify/contracts/ai-service';
import type { AiIntent, AiTrackReference } from './ai-intent';
import { aiNameKey, aiTrackKey } from './ai-intent-rules';

export type AiIntentPatch = IntentPatch;
export type AiPreservation = PreservationConstraints;
export type AiPreservationPatch = PreservationPatch;

export const EMPTY_AI_PRESERVATION: AiPreservation = {
  firstTracks: null,
  positions: [],
  artists: [],
};

type ValuePatch<T> =
  { operation: 'set'; value: T } | { operation: 'clear' } | null;

export function applyIntentPatch(
  intent: AiIntent,
  patch: AiIntentPatch,
): AiIntent {
  return {
    ...intent,
    kind: patch.kind?.value ?? intent.kind,
    artists: applyNames(intent.artists, patch.artists),
    genres: applyNames(intent.genres, patch.genres),
    seedTracks: applyTracks(intent.seedTracks, patch.seedTracks),
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
    ...nameConflicts(patch.genres),
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

function applyNames(current: string[], patch: NameListPatch): string[] {
  const removed = new Set(patch.remove.map(aiNameKey));
  const kept = current.filter((name) => !removed.has(aiNameKey(name)));

  return uniqueByKey([...kept, ...patch.add], aiNameKey);
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

function nameConflicts(patch: NameListPatch): string[] {
  const removed = new Set(patch.remove.map(aiNameKey));
  return patch.add.filter((name) => removed.has(aiNameKey(name)));
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
