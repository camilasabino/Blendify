import { MixMode } from './mix-mode';
import { buildArtistQueries, rankTracksForMix } from './artist-mix-queries';

describe('buildArtistQueries', () => {
  it('keeps a hard search budget of 2 for every mix mode', () => {
    for (const mode of Object.values(MixMode)) {
      const plan = buildArtistQueries('Radiohead', mode);
      expect(plan.maxSearches).toBe(2);
      expect(plan.queries.length).toBeGreaterThan(0);
      expect(plan.offsets.length).toBeGreaterThan(0);
    }
  });

  it('quotes the artist name for balanced searches', () => {
    const plan = buildArtistQueries('Pink Floyd', MixMode.BALANCED);
    expect(plan.queries).toEqual(['artist:"Pink Floyd"']);
    expect(plan.rank).toBe('as_found');
  });

  it('ranks rarities by ascending popularity', () => {
    const plan = buildArtistQueries('Sade', MixMode.RARITIES);
    expect(plan.rank).toBe('popularity_asc');
  });
});

describe('rankTracksForMix', () => {
  const tracks = [
    { id: 'a', popularity: 10 },
    { id: 'b', popularity: 90 },
    { id: 'c', popularity: 40 },
  ];

  it('leaves as_found order untouched', () => {
    expect(rankTracksForMix(tracks, 'as_found').map((t) => t.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('sorts by popularity desc/asc', () => {
    expect(
      rankTracksForMix(tracks, 'popularity_desc').map((t) => t.id),
    ).toEqual(['b', 'c', 'a']);
    expect(rankTracksForMix(tracks, 'popularity_asc').map((t) => t.id)).toEqual(
      ['a', 'c', 'b'],
    );
  });
});
