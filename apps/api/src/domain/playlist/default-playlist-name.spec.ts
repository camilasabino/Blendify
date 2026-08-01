import {
  buildDefaultPlaylistDescription,
  buildDefaultPlaylistName,
} from './default-playlist-name';

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

  it('joins two names', () => {
    expect(
      buildDefaultPlaylistName({
        names: ['A', 'B'],
      }),
    ).toBe('Blendify · Mix · A + B');
  });

  it('summarizes many names', () => {
    expect(
      buildDefaultPlaylistName({
        names: ['A', 'B', 'C'],
      }),
    ).toBe('Blendify · Mix · A + 2');
  });

  it('truncates very long names', () => {
    const long = 'X'.repeat(120);
    const name = buildDefaultPlaylistName({ names: [long] });
    expect(name.length).toBeLessThanOrEqual(100);
    expect(name.endsWith('…')).toBe(true);
  });
});

describe('buildDefaultPlaylistDescription', () => {
  it('covers empty, one, two, and many seeds', () => {
    expect(buildDefaultPlaylistDescription({ names: [] })).toBe(
      'Made with Blendify.',
    );
    expect(buildDefaultPlaylistDescription({ names: ['Sade'] })).toBe(
      'Made with Blendify from Sade.',
    );
    expect(buildDefaultPlaylistDescription({ names: ['A', 'B'] })).toBe(
      'Made with Blendify from A and B.',
    );
    expect(buildDefaultPlaylistDescription({ names: ['A', 'B', 'C'] })).toBe(
      'Made with Blendify from A and 2 more.',
    );
  });
});
