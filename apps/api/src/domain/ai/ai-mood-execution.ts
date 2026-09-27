import type {
  AiMood,
  AiMoodUnmetReason,
  PlaylistKind,
} from '@blendify/contracts';
import { moodGenreIds } from '@/domain/genre/mood-genres';

export type AiMoodExecution =
  | { mood: AiMood; applied: true }
  | { mood: AiMood; applied: false; reason: AiMoodUnmetReason };

export function moodExecutionFor(input: {
  kind: PlaylistKind;
  mood: AiMood | null;
  explicitGenreIds: readonly string[];
}): AiMoodExecution | null {
  const { mood } = input;

  if (mood === null) {
    return null;
  }
  if (input.kind !== 'genre_mix') {
    return { mood, applied: false, reason: 'seed_not_mood_based' };
  }
  if (input.explicitGenreIds.length === 0) {
    return { mood, applied: true };
  }

  const moodGenres = new Set(moodGenreIds(mood));
  const moodEnforcedByGenres = input.explicitGenreIds.every((genreId) =>
    moodGenres.has(genreId),
  );
  return moodEnforcedByGenres
    ? { mood, applied: true }
    : {
        mood,
        applied: false,
        reason: 'mood_not_enforced_for_explicit_genres',
      };
}
