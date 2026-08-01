import { PopularityMode, TrackOrderMode } from '@blendify/contracts';
import { GeneratePlaylistSchema } from './generate-playlist.dto';

describe('GeneratePlaylistSchema', () => {
  it('accepts a minimal valid payload with popularity', () => {
    const parsed = GeneratePlaylistSchema.parse({
      kind: 'artist_mix',
      userId: 'user-1',
      artistIds: ['a1'],
      tracksPerSeed: 10,
      popularity: PopularityMode.BALANCED,
    });

    expect(parsed.kind).toBe('artist_mix');
    expect(parsed.tracksPerSeed).toBe(10);
    expect(parsed.popularity).toBe(PopularityMode.BALANCED);
    expect(parsed.orderMode).toBe(TrackOrderMode.RANDOM);
    expect(parsed.persistToLibrary).toBe(true);
    expect(parsed.name).toBe('');
    expect(parsed.description).toBe('');
  });

  it('accepts client artist snapshots', () => {
    const parsed = GeneratePlaylistSchema.parse({
      kind: 'artist_mix',
      userId: 'user-1',
      artistIds: ['a1'],
      tracksPerSeed: 20,
      popularity: PopularityMode.POPULAR,
      artists: [{ id: 'a1', name: 'Sade', imageUrl: null }],
    });
    expect(parsed.artists?.[0]?.name).toBe('Sade');
  });

  it('rejects empty artistIds', () => {
    expect(() =>
      GeneratePlaylistSchema.parse({
        kind: 'artist_mix',
        userId: 'u',
        artistIds: [],
        tracksPerSeed: 10,
        popularity: PopularityMode.BALANCED,
      }),
    ).toThrow();
  });

  it('requires the artist mix discriminator and track count', () => {
    expect(() =>
      GeneratePlaylistSchema.parse({
        userId: 'u',
        artistIds: ['a1'],
        popularity: PopularityMode.BALANCED,
      }),
    ).toThrow();
  });
});
