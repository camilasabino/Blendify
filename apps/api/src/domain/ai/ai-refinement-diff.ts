import type {
  AiIntentChangeDto,
  AiRefinementTrackDiffDto,
} from '@blendify/contracts';
import { resolveAiGenreSeeds } from './ai-genre-seeds';
import type { AiIntent, AiTrackReference } from './ai-intent';
import { aiNameKey, aiTrackKey } from './ai-intent-rules';

export type AiRefinementTrackDiff = AiRefinementTrackDiffDto;
export type AiIntentChange = AiIntentChangeDto;

export interface AiRefinementDiff {
  tracks: AiRefinementTrackDiff;
  intent: AiIntentChange[];
}

interface DiffTrack {
  id: string;
  durationMs: number;
}

export function diffPlaylistTracks(
  current: readonly DiffTrack[],
  candidate: readonly DiffTrack[],
): AiRefinementTrackDiff {
  const currentPositions = positionsById(current);
  const candidatePositions = positionsById(candidate);

  const removed = current.flatMap((track, index) =>
    candidatePositions.has(track.id)
      ? []
      : [{ trackId: track.id, position: index + 1 }],
  );
  const added = candidate.flatMap((track, index) =>
    currentPositions.has(track.id)
      ? []
      : [{ trackId: track.id, position: index + 1 }],
  );
  const retained = candidate.flatMap((track, index) => {
    const from = currentPositions.get(track.id);
    return from === undefined
      ? []
      : [{ trackId: track.id, from, to: index + 1 }];
  });
  const inPlace = longestIncreasingRun(retained.map((track) => track.from));

  return {
    added,
    removed,
    moved: retained.filter((_, index) => !inPlace.has(index)),
    retainedCount: retained.length,
    replacedCount: Math.min(added.length, removed.length),
    before: totals(current),
    after: totals(candidate),
  };
}

export function diffIntents(
  current: AiIntent,
  proposed: AiIntent,
): AiIntentChange[] {
  const changes: AiIntentChange[] = [];

  if (current.kind !== proposed.kind) {
    changes.push({ field: 'kind', from: current.kind, to: proposed.kind });
  }
  const artists = nameChanges(current.artists, proposed.artists, aiNameKey);
  if (artists) {
    changes.push({ field: 'artists', ...artists });
  }
  const genres = nameChanges(
    genreNames(current),
    genreNames(proposed),
    (name) => name,
  );
  if (genres) {
    changes.push({ field: 'genres', ...genres });
  }
  const currentRegion = resolveAiGenreSeeds(current.genres).region;
  const proposedRegion = resolveAiGenreSeeds(proposed.genres).region;
  if (currentRegion !== proposedRegion) {
    changes.push({ field: 'region', from: currentRegion, to: proposedRegion });
  }
  const seedTracks = trackChanges(current.seedTracks, proposed.seedTracks);
  if (seedTracks) {
    changes.push({ field: 'seedTracks', ...seedTracks });
  }
  if (current.targetTrackCount !== proposed.targetTrackCount) {
    changes.push({
      field: 'targetTrackCount',
      from: current.targetTrackCount,
      to: proposed.targetTrackCount,
    });
  }
  if (current.targetDurationMinutes !== proposed.targetDurationMinutes) {
    changes.push({
      field: 'targetDurationMinutes',
      from: current.targetDurationMinutes,
      to: proposed.targetDurationMinutes,
    });
  }
  if (current.mood !== proposed.mood) {
    changes.push({ field: 'mood', from: current.mood, to: proposed.mood });
  }
  if (current.popularity !== proposed.popularity) {
    changes.push({
      field: 'popularity',
      from: current.popularity,
      to: proposed.popularity,
    });
  }
  if (current.orderMode !== proposed.orderMode) {
    changes.push({
      field: 'orderMode',
      from: current.orderMode,
      to: proposed.orderMode,
    });
  }
  const excludeArtists = nameChanges(
    current.excludeArtists,
    proposed.excludeArtists,
    aiNameKey,
  );
  if (excludeArtists) {
    changes.push({ field: 'excludeArtists', ...excludeArtists });
  }
  const excludeTracks = trackChanges(
    current.excludeTracks,
    proposed.excludeTracks,
  );
  if (excludeTracks) {
    changes.push({ field: 'excludeTracks', ...excludeTracks });
  }
  return changes;
}

function nameChanges(
  current: readonly string[],
  proposed: readonly string[],
  keyOf: (name: string) => string,
): { added: string[]; removed: string[] } | null {
  const currentKeys = new Set(current.map(keyOf));
  const proposedKeys = new Set(proposed.map(keyOf));
  const added = proposed.filter((name) => !currentKeys.has(keyOf(name)));
  const removed = current.filter((name) => !proposedKeys.has(keyOf(name)));

  return added.length > 0 || removed.length > 0 ? { added, removed } : null;
}

function trackChanges(
  current: readonly AiTrackReference[],
  proposed: readonly AiTrackReference[],
): { added: AiTrackReference[]; removed: AiTrackReference[] } | null {
  const currentKeys = new Set(current.map(aiTrackKey));
  const proposedKeys = new Set(proposed.map(aiTrackKey));
  const added = proposed.filter((track) => !currentKeys.has(aiTrackKey(track)));
  const removed = current.filter(
    (track) => !proposedKeys.has(aiTrackKey(track)),
  );

  return added.length > 0 || removed.length > 0 ? { added, removed } : null;
}

function genreNames(intent: AiIntent): string[] {
  return resolveAiGenreSeeds(intent.genres).genres.map((genre) => genre.name);
}

function positionsById(tracks: readonly DiffTrack[]): Map<string, number> {
  return new Map(tracks.map((track, index) => [track.id, index + 1]));
}

function totals(tracks: readonly DiffTrack[]) {
  return {
    trackCount: tracks.length,
    durationMs: tracks.reduce((total, track) => total + track.durationMs, 0),
  };
}

function longestIncreasingRun(values: readonly number[]): Set<number> {
  const tails: number[] = [];
  const previous: number[] = [];

  values.forEach((value, index) => {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (values[tails[middle]] < value) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    previous[index] = low > 0 ? tails[low - 1] : -1;
    tails[low] = index;
  });

  const kept = new Set<number>();
  for (let index = tails.at(-1) ?? -1; index !== -1; index = previous[index]) {
    kept.add(index);
  }
  return kept;
}
