import { AI_MOODS } from '@blendify/contracts';
import { MAX_GENRES } from '@/domain/constants';
import { GENRE_CATALOG } from './genre-catalog';
import moodGenreMap from './data/mood-genre-map.json';
import { moodGenreIds } from './mood-genres';

const CATALOG_IDS = new Set(GENRE_CATALOG.map((genre) => genre.id));
const ACTIVITIES = [
  'focus',
  'workout',
  'running',
  'party',
  'studying',
  'sleep',
];

describe('curated mood → genre mapping', () => {
  it('maps exactly the moods of the shared vocabulary', () => {
    expect(Object.keys(moodGenreMap).sort()).toEqual([...AI_MOODS].sort());
  });

  it('never maps an activity as a mood', () => {
    const moods: readonly string[] = AI_MOODS;

    expect(ACTIVITIES.filter((activity) => moods.includes(activity))).toEqual(
      [],
    );
    expect(
      ACTIVITIES.filter((activity) => Object.hasOwn(moodGenreMap, activity)),
    ).toEqual([]);
  });

  it.each(AI_MOODS)('maps %s to a small set of distinct genres', (mood) => {
    const genreIds = moodGenreIds(mood);

    expect(genreIds.length).toBeGreaterThan(0);
    expect(genreIds.length).toBeLessThanOrEqual(MAX_GENRES);
    expect(new Set(genreIds).size).toBe(genreIds.length);
  });

  it.each(AI_MOODS)('maps %s only to canonical MusicBrainz genres', (mood) => {
    const unknown = moodGenreIds(mood).filter((id) => !CATALOG_IDS.has(id));

    expect(unknown).toEqual([]);
  });
});
