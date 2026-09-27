import type { AiMood } from '@blendify/contracts';
import moodGenreMap from './data/mood-genre-map.json';

const MOOD_GENRE_IDS: Readonly<Record<AiMood, readonly string[]>> =
  moodGenreMap;

export function moodGenreIds(mood: AiMood): readonly string[] {
  return MOOD_GENRE_IDS[mood];
}
