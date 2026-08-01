import { PopularityMode } from '@blendify/contracts';
import {
  buildArtistQueries,
  preferPopularTracks,
  preferRareTracks,
  rankTracksForMix,
} from './artist-mix-queries';

describe('buildArtistQueries', () => {
  it('paginates enough pages to fill a typical tracks-per-seed budget', () => {
    for (const mode of Object.values(PopularityMode)) {
      const plan = buildArtistQueries('Radiohead', mode);
      expect(plan.maxSearches).toBeGreaterThanOrEqual(3);
      expect(plan.offsets.length).toBeGreaterThanOrEqual(3);
      expect(plan.queries.length).toBeGreaterThan(0);
    }
  });

  it('uses multi-page search for balanced mixes', () => {
    const plan = buildArtistQueries('Pink Floyd', PopularityMode.BALANCED);
    expect(plan.queries).toEqual(['artist:"Pink Floyd"']);
    expect(plan.offsets).toEqual([0, 10, 20]);
    expect(plan.maxSearches).toBe(3);
    expect(plan.rank).toBe('as_found');
  });

  it('ranks rarities by ascending popularity', () => {
    const plan = buildArtistQueries('Sade', PopularityMode.RARITIES);
    expect(plan.rank).toBe('popularity_asc');
    expect(plan.maxSearches).toBeGreaterThanOrEqual(3);
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

describe('preferPopularTracks', () => {
  const tracks = [
    { id: 'a', popularity: 10 },
    { id: 'b', popularity: 90 },
    { id: 'c', popularity: 40 },
    { id: 'd', popularity: 20 },
  ];

  it('keeps only popular tracks when enough exist', () => {
    expect(preferPopularTracks(tracks, 2, 35).map((t) => t.id)).toEqual([
      'b',
      'c',
    ]);
  });

  it('falls back to popularity-sorted pool when threshold would underfill', () => {
    expect(preferPopularTracks(tracks, 3, 35).map((t) => t.id)).toEqual([
      'b',
      'c',
      'd',
      'a',
    ]);
  });
});

describe('preferRareTracks', () => {
  const tracks = [
    { id: 'hit', popularity: 90 },
    { id: 'mid', popularity: 55 },
    { id: 'cut', popularity: 32 },
    { id: 'deep', popularity: 18 },
  ];

  it('keeps only lower-popularity cuts when enough exist', () => {
    expect(preferRareTracks(tracks, 2, 48).map((t) => t.id)).toEqual([
      'deep',
      'cut',
    ]);
  });

  it('falls back to least-popular pool when ceiling would underfill', () => {
    expect(preferRareTracks(tracks, 3, 20).map((t) => t.id)).toEqual([
      'deep',
      'cut',
      'mid',
      'hit',
    ]);
  });
});
