import {
  MAX_ARTISTS,
  MAX_GENRES,
  MAX_TRACKS,
  maxTracksPerSeedForCount,
} from './constants';

describe('playlist caps', () => {
  it('exposes stable hard limits', () => {
    expect(MAX_ARTISTS).toBe(12);
    expect(MAX_GENRES).toBe(5);
    expect(MAX_TRACKS).toBe(50);
  });

  it('caps tracks per seed by the total track budget', () => {
    expect(maxTracksPerSeedForCount(1)).toBe(50);
    expect(maxTracksPerSeedForCount(2)).toBe(25);
    expect(maxTracksPerSeedForCount(4)).toBe(12);
    expect(maxTracksPerSeedForCount(5)).toBe(10);
    expect(maxTracksPerSeedForCount(10)).toBe(5);
    expect(maxTracksPerSeedForCount(0)).toBe(50);
  });
});
