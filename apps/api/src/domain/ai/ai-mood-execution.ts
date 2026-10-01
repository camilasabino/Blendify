import type { AiMoodNotAppliedReason } from '@blendify/contracts';
import { resolveAiGenreSeeds } from './ai-genre-seeds';
import type { AiIntent } from './ai-intent';

export function moodNotAppliedReason(
  intent: Pick<AiIntent, 'kind' | 'mood' | 'genres'>,
): AiMoodNotAppliedReason | null {
  if (intent.mood === null) {
    return null;
  }
  if (intent.kind !== 'genre_mix') {
    return 'seed_not_mood_based';
  }

  return resolveAiGenreSeeds(intent.genres).genres.length > 0
    ? 'explicit_genre_precedence'
    : null;
}
