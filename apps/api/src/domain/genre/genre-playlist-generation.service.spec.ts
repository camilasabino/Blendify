import { MixMode } from './mix-mode';
import { buildGenreQueries } from './genre-playlist-generation.service';
import type { CuratedGenre } from './curated-genres';

const jazz: CuratedGenre = {
  id: 'jazz',
  name: 'Jazz',
  spotifyGenre: 'jazz',
  keywords: [],
};

describe('buildGenreQueries', () => {
  it('keeps a hard search budget of 2 for every mix mode', () => {
    for (const mode of Object.values(MixMode)) {
      const plan = buildGenreQueries(jazz, mode);
      expect(plan.maxSearches).toBe(2);
      expect(plan.queries.every((q) => /jazz/i.test(q))).toBe(true);
    }
  });

  it('uses genre filters for popular mode', () => {
    const plan = buildGenreQueries(jazz, MixMode.POPULAR);
    expect(plan.queries[0]).toBe('genre:"jazz"');
    expect(plan.rank).toBe('popularity_desc');
    expect(plan.minPopularity).toBe(40);
  });
});
