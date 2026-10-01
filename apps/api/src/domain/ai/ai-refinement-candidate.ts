import type { TrackOrderMode } from '@blendify/contracts';
import { normalizeArtistName } from '@/domain/artist/artist-name-match';
import { MAX_TRACKS } from '@/domain/constants';
import { moodGenreIds } from '@/domain/genre/mood-genres';
import {
  RandomFlatStrategy,
  createOrderingStrategy,
} from '@/domain/services/strategies/track-ordering.strategy';
import type { Track } from '@/domain/track/track.entity';
import { resolveAiGenreSeeds } from './ai-genre-seeds';
import {
  AI_DEFAULT_ORDER_MODE,
  AI_DEFAULT_POPULARITY,
  type AiIntent,
} from './ai-intent';
import { aiNameKey, aiTrackKey } from './ai-intent-rules';
import { seedTypeOfKind } from './ai-seeds';
import {
  candidateTrackCountForDuration,
  isDurationBelowTolerance,
} from './ai-target-duration';
import {
  closestDurationPrefix,
  creditedArtistKeys,
  exclusionMatcher,
  keepPriority,
  totalDurationMs,
} from './ai-track-selection';

export type AiRefinementStrategy =
  | { kind: 'transform' }
  | { kind: 'retain_and_fill'; droppedArtists: string[] }
  | { kind: 'regenerate' };

export type AiRefinementArrangement = 'keep' | TrackOrderMode;

export type AiRefinementAssembly =
  | { status: 'assembled'; tracks: Track[] }
  | { status: 'order_conflict' }
  | { status: 'insufficient'; reason: 'no_tracks' | 'unfilled_positions' };

export interface AiRefinementAssemblyInput {
  currentTracks: readonly Track[];
  preservedPositions: readonly number[];
  strategy: AiRefinementStrategy;
  generatedTracks: readonly Track[];
  intent: AiIntent;
  arrangement: AiRefinementArrangement;
  random: () => number;
}

export function refinementStrategy(input: {
  current: AiIntent;
  proposed: AiIntent;
  currentTracks: readonly Track[];
}): AiRefinementStrategy {
  const { current, proposed, currentTracks } = input;

  if (generationBasis(current) !== generationBasis(proposed)) {
    const droppedArtists = removedArtistSeeds(current, proposed);
    return droppedArtists.length > 0
      ? { kind: 'retain_and_fill', droppedArtists }
      : { kind: 'regenerate' };
  }

  const isExcluded = excludedBy(proposed);
  const retained = currentTracks.filter((track) => !isExcluded(track));
  const targetsChanged =
    current.targetTrackCount !== proposed.targetTrackCount ||
    current.targetDurationMinutes !== proposed.targetDurationMinutes;
  const dropped = retained.length < currentTracks.length;
  if (
    (dropped || targetsChanged) &&
    isShort(retained, proposed, currentTracks.length)
  ) {
    return { kind: 'retain_and_fill', droppedArtists: [] };
  }
  return { kind: 'transform' };
}

export function fillCandidateTrackCount(
  proposed: AiIntent,
  keptTrackCount: number,
  currentTrackCount: number,
): number {
  if (
    proposed.targetTrackCount === null &&
    proposed.targetDurationMinutes !== null
  ) {
    return candidateTrackCountForDuration(proposed.targetDurationMinutes);
  }

  const target = proposed.targetTrackCount ?? currentTrackCount;
  return Math.min(MAX_TRACKS, Math.max(1, target - keptTrackCount));
}

export function retainedTracks(
  currentTracks: readonly Track[],
  proposed: AiIntent,
  strategy: AiRefinementStrategy,
): Track[] {
  if (strategy.kind === 'regenerate') {
    return [];
  }
  const isExcluded = excludedBy(proposed);
  const dropped = new Set(
    strategy.kind === 'retain_and_fill'
      ? strategy.droppedArtists.map(normalizeArtistName)
      : [],
  );

  return currentTracks.filter(
    (track) =>
      !isExcluded(track) &&
      !creditedArtistKeys(track).some((artist) => dropped.has(artist)),
  );
}

export function refinementArrangement(
  current: AiIntent,
  proposed: AiIntent,
  strategy: AiRefinementStrategy,
): AiRefinementArrangement {
  const mode = proposed.orderMode ?? AI_DEFAULT_ORDER_MODE;
  if (mode !== 'random') {
    return mode;
  }

  const changed = (current.orderMode ?? AI_DEFAULT_ORDER_MODE) !== mode;
  return changed && strategy.kind !== 'regenerate' ? 'random' : 'keep';
}

export function assembleRefinementCandidate(
  input: AiRefinementAssemblyInput,
): AiRefinementAssembly {
  const { currentTracks, preservedPositions, intent } = input;
  const fixed = new Map(
    preservedPositions.map((position) => [
      position,
      currentTracks[position - 1],
    ]),
  );
  const usedIds = new Set([...fixed.values()].map(trackId));
  const isExcluded = excludedBy(intent);

  const retained = takeUnique(
    retainedTracks(currentTracks, intent, input.strategy).filter(
      (track) => !usedIds.has(trackId(track)),
    ),
    usedIds,
  );
  const allowedGenerated = input.generatedTracks.filter(
    (track) => !isExcluded(track),
  );
  const added = takeUnique(allowedGenerated, usedIds);
  const priority = [...keepPriority(retained), ...keepPriority(added)];

  const lastFixed = preservedPositions.at(-1) ?? 0;
  const desired =
    intent.targetTrackCount ??
    Math.max(
      lastFixed,
      unconstrainedLength(input, [...fixed.values()], priority),
    );
  const length = Math.min(MAX_TRACKS, fixed.size + priority.length, desired);
  if (length === 0) {
    return { status: 'insufficient', reason: 'no_tracks' };
  }
  if (length < lastFixed) {
    return { status: 'insufficient', reason: 'unfilled_positions' };
  }

  const chosen = new Set(priority.slice(0, length - fixed.size));
  const movable = arrange(
    [...retained, ...added].filter((track) => chosen.has(track)),
    input.arrangement,
    input.random,
  );

  const tracks: Track[] = [];
  let next = 0;
  for (let position = 1; position <= length; position += 1) {
    const kept = fixed.get(position);
    if (kept) {
      tracks.push(kept);
    } else {
      tracks.push(movable[next]);
      next += 1;
    }
  }

  if (
    fixed.size > 0 &&
    (input.arrangement === 'artist' || input.arrangement === 'title') &&
    !isArranged(tracks, input.arrangement)
  ) {
    return { status: 'order_conflict' };
  }
  return { status: 'assembled', tracks };
}

function unconstrainedLength(
  input: AiRefinementAssemblyInput,
  fixedTracks: readonly Track[],
  priority: readonly Track[],
): number {
  const { intent } = input;

  if (intent.targetDurationMinutes !== null) {
    return closestDurationPrefix(priority, intent.targetDurationMinutes, {
      count: fixedTracks.length,
      durationMs: totalDurationMs(fixedTracks),
    });
  }
  if (input.strategy.kind === 'regenerate') {
    const isExcluded = excludedBy(intent);
    const generated = new Set(
      input.generatedTracks.filter((track) => !isExcluded(track)).map(trackId),
    );
    return Math.max(fixedTracks.length, generated.size);
  }
  return input.currentTracks.length;
}

function isShort(
  retained: readonly Track[],
  intent: AiIntent,
  currentTrackCount: number,
): boolean {
  if (intent.targetTrackCount !== null) {
    return retained.length < intent.targetTrackCount;
  }
  if (intent.targetDurationMinutes !== null) {
    return isDurationBelowTolerance(
      totalDurationMs(retained),
      intent.targetDurationMinutes,
    );
  }
  return retained.length < currentTrackCount;
}

function generationBasis(intent: AiIntent): string {
  return JSON.stringify({
    kind: intent.kind,
    seeds: basisSeeds(intent),
    region: resolveAiGenreSeeds(intent.genres).region,
    popularity: intent.popularity ?? AI_DEFAULT_POPULARITY,
  });
}

function basisSeeds(intent: AiIntent): string[] {
  switch (seedTypeOfKind(intent.kind)) {
    case 'artist':
      return sortedUnique(intent.artists.map(aiNameKey));
    case 'genre':
      return sortedUnique(effectiveGenreIds(intent));
    case 'track':
      return intent.seedTracks.map(aiTrackKey);
  }
}

function effectiveGenreIds(intent: AiIntent): string[] {
  const explicit = resolveAiGenreSeeds(intent.genres).genres.map(
    (genre) => genre.id,
  );
  if (explicit.length > 0 || intent.mood === null) {
    return explicit;
  }
  return [...moodGenreIds(intent.mood)];
}

function removedArtistSeeds(current: AiIntent, proposed: AiIntent): string[] {
  const sameMix =
    current.kind === 'artist_mix' &&
    proposed.kind === 'artist_mix' &&
    (current.popularity ?? AI_DEFAULT_POPULARITY) ===
      (proposed.popularity ?? AI_DEFAULT_POPULARITY);
  if (!sameMix) {
    return [];
  }

  const currentKeys = new Set(current.artists.map(aiNameKey));
  const proposedKeys = new Set(proposed.artists.map(aiNameKey));
  if ([...proposedKeys].some((key) => !currentKeys.has(key))) {
    return [];
  }
  return current.artists.filter((name) => !proposedKeys.has(aiNameKey(name)));
}

function excludedBy(intent: AiIntent): (track: Track) => boolean {
  return exclusionMatcher({
    artists: intent.excludeArtists,
    tracks: intent.excludeTracks,
  });
}

function arrange(
  tracks: Track[],
  arrangement: AiRefinementArrangement,
  random: () => number,
): Track[] {
  switch (arrangement) {
    case 'keep':
      return tracks;
    case 'random':
      return new RandomFlatStrategy(random).order(new Map([['', tracks]]));
    default:
      return createOrderingStrategy(arrangement).order(new Map([['', tracks]]));
  }
}

function isArranged(tracks: Track[], mode: TrackOrderMode): boolean {
  const ordered = createOrderingStrategy(mode).order(new Map([['', tracks]]));
  return ordered.every((track, index) => track === tracks[index]);
}

function takeUnique(tracks: readonly Track[], usedIds: Set<string>): Track[] {
  return tracks.filter((track) => {
    const id = trackId(track);
    if (usedIds.has(id)) {
      return false;
    }
    usedIds.add(id);
    return true;
  });
}

function trackId(track: Track): string {
  return track.id.getValue();
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
