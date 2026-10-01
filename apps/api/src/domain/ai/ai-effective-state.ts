import { aiGenreKey } from './ai-genre-seeds';
import {
  AI_DEFAULT_ORDER_MODE,
  AI_DEFAULT_POPULARITY,
  type AiIntent,
} from './ai-intent';
import type { AiPreservation } from './ai-intent-patch';
import { aiNameKey, aiTrackKey } from './ai-intent-rules';
import { aiSelectionFilters } from './ai-selection-filters';

export interface AiEffectiveState {
  intent: AiIntent;
  preservation: AiPreservation;
}

export function isSameEffectiveState(
  left: AiEffectiveState,
  right: AiEffectiveState,
): boolean {
  return canonicalState(left) === canonicalState(right);
}

function canonicalState({ intent, preservation }: AiEffectiveState): string {
  return JSON.stringify({
    kind: intent.kind,
    artists: sortedKeys(intent.artists, aiNameKey),
    genres: sortedKeys(intent.genres, aiGenreKey),
    seedTracks: sortedKeys(intent.seedTracks, aiTrackKey),
    filters: aiSelectionFilters(intent),
    targetTrackCount: intent.targetTrackCount,
    targetDurationMinutes: intent.targetDurationMinutes,
    mood: intent.mood,
    popularity: intent.popularity ?? AI_DEFAULT_POPULARITY,
    orderMode: intent.orderMode ?? AI_DEFAULT_ORDER_MODE,
    excludeArtists: sortedKeys(intent.excludeArtists, aiNameKey),
    excludeTracks: sortedKeys(intent.excludeTracks, aiTrackKey),
    unsupportedConstraints: intent.unsupportedConstraints,
    firstTracks: preservation.firstTracks,
    positions: [...preservation.positions].sort((a, b) => a - b),
    preservedArtists: sortedKeys(preservation.artists, aiNameKey),
  });
}

function sortedKeys<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
): string[] {
  return items.map(keyOf).sort((left, right) => left.localeCompare(right));
}
