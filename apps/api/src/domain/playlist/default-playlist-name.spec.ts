import { MixMode } from '../genre/mix-mode';
import { buildDefaultPlaylistName } from './default-playlist-name';

describe('buildDefaultPlaylistName', () => {
  it('falls back to mix-only when names are empty', () => {
    expect(
      buildDefaultPlaylistName({ names: [], mixMode: MixMode.POPULAR }),
    ).toBe('Blendify · Popular');
  });

  it('names one and two artists', () => {
    expect(
      buildDefaultPlaylistName({
        names: ['Sade'],
        mixMode: MixMode.BALANCED,
      }),
    ).toBe('Blendify · Sade · Balanced');

    expect(
      buildDefaultPlaylistName({
        names: ['Sade', 'D’Angelo'],
        mixMode: MixMode.MOOD_CHILL,
      }),
    ).toBe('Blendify · Sade + D’Angelo · Chill');
  });

  it('summarizes three or more names', () => {
    expect(
      buildDefaultPlaylistName({
        names: ['A', 'B', 'C', 'D'],
        mixMode: MixMode.RARITIES,
      }),
    ).toBe('Blendify · A + 3 · Rarities');
  });

  it('truncates very long titles', () => {
    const long = 'X'.repeat(120);
    const name = buildDefaultPlaylistName({
      names: [long],
      mixMode: MixMode.BALANCED,
    });
    expect(name.length).toBeLessThanOrEqual(100);
    expect(name.endsWith('…')).toBe(true);
  });
});
