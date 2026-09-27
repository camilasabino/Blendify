import { AI_MOODS } from '@blendify/contracts';
import { MAX_GENRES } from '@/domain/constants';
import { CURATED_GENRES } from './curated-genres';
import moodGenreMap from './data/mood-genre-map.json';
import { moodGenreIds } from './mood-genres';

const CATALOG_IDS = new Set(CURATED_GENRES.map((genre) => genre.id));

describe('curated mood → genre mapping', () => {
  it('maps exactly the moods of the shared vocabulary', () => {
    expect(Object.keys(moodGenreMap).sort()).toEqual([...AI_MOODS].sort());
  });

  it.each(AI_MOODS)('maps %s to a small set of distinct genres', (mood) => {
    const genreIds = moodGenreIds(mood);

    expect(genreIds.length).toBeGreaterThan(0);
    expect(genreIds.length).toBeLessThanOrEqual(MAX_GENRES);
    expect(new Set(genreIds).size).toBe(genreIds.length);
  });

  it.each(AI_MOODS)(
    'maps %s only to Blendify genre ids in the curated catalog',
    (mood) => {
      const unknown = moodGenreIds(mood).filter((id) => !CATALOG_IDS.has(id));

      expect(unknown).toEqual([]);
    },
  );
});
