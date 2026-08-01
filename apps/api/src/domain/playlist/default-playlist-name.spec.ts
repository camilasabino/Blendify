import { buildDefaultPlaylistName } from './default-playlist-name';

describe('buildDefaultPlaylistName', () => {
  it('uses Mix branding when empty', () => {
    expect(
      buildDefaultPlaylistName({
        names: [],
      }),
    ).toBe('Blendify · Mix');
  });

  it('includes one artist after Mix', () => {
    expect(
      buildDefaultPlaylistName({
        names: ['Radiohead'],
      }),
    ).toBe('Blendify · Mix · Radiohead');
  });

  it('summarizes many names', () => {
    expect(
      buildDefaultPlaylistName({
        names: ['A', 'B', 'C'],
      }),
    ).toBe('Blendify · Mix · A + 2');
  });
});
