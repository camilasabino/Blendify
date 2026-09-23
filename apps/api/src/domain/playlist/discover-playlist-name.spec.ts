import {
  buildDiscoverPlaylistDescription,
  buildDiscoverPlaylistName,
  discoverSimilarTargetForTracks,
  tracksPerSeedForDiscoverTarget,
} from './discover-playlist-name';

describe('discover playlist naming helpers', () => {
  it('builds names and descriptions for artist and track seeds', () => {
    expect(buildDiscoverPlaylistName('  Cher  ')).toContain('Cher');
    expect(buildDiscoverPlaylistName('   ')).toContain('Discover');

    expect(
      buildDiscoverPlaylistDescription({
        seedName: 'Believe',
        seedType: 'track',
        artistName: 'Cher',
      }),
    ).toContain('Believe');

    expect(
      buildDiscoverPlaylistDescription({
        seedName: 'Believe',
        seedType: 'track',
      }),
    ).toContain('Around');

    expect(
      buildDiscoverPlaylistDescription({
        seedName: 'Cher',
        seedType: 'artist',
      }),
    ).toContain('orbit');

    expect(
      buildDiscoverPlaylistDescription({ seedName: '   ', seedType: 'track' }),
    ).toContain('this pick');

    expect(buildDiscoverPlaylistName('a'.repeat(200)).length).toBeLessThan(200);
  });

  it('sizes similar-artist and per-seed targets', () => {
    expect(discoverSimilarTargetForTracks(10)).toBe(10);
    expect(tracksPerSeedForDiscoverTarget(30, 0, 10)).toBe(1);
    expect(tracksPerSeedForDiscoverTarget(30, 5, 10)).toBe(6);
    expect(tracksPerSeedForDiscoverTarget(30, 5, 4)).toBe(4);
  });
});
