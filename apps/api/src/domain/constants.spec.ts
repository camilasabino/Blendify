import {
  MAX_ARTISTS,
  MAX_GENRES,
  MAX_SONGS_PER_ARTIST,
  MAX_TRACKS,
  maxSongsPerArtistForCount,
  maxSongsPerGenreForCount,
} from './constants';

describe('playlist caps', () => {
  it('exposes stable hard limits', () => {
    expect(MAX_ARTISTS).toBe(25);
    expect(MAX_GENRES).toBe(15);
    expect(MAX_TRACKS).toBe(200);
    expect(MAX_SONGS_PER_ARTIST).toBe(25);
  });

  it('caps songs per artist by total track budget', () => {
    expect(maxSongsPerArtistForCount(1)).toBe(25);
    expect(maxSongsPerArtistForCount(8)).toBe(25);
    expect(maxSongsPerArtistForCount(25)).toBe(8);
    expect(maxSongsPerArtistForCount(0)).toBe(25);
  });

  it('caps songs per genre by total track budget', () => {
    expect(maxSongsPerGenreForCount(1)).toBe(200);
    expect(maxSongsPerGenreForCount(4)).toBe(50);
    expect(maxSongsPerGenreForCount(0)).toBe(200);
  });
});
