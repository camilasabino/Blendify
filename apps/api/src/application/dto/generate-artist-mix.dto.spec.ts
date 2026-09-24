import { PopularityMode, TrackOrderMode } from '@blendify/contracts';
import { GenerateArtistMixSchema } from './generate-artist-mix.dto';

describe('GenerateArtistMixSchema', () => {
  it('accepts a minimal valid payload with popularity', () => {
    const parsed = GenerateArtistMixSchema.parse({
      kind: 'artist_mix',
      artistIds: ['a1'],
      tracksPerSeed: 10,
      popularity: PopularityMode.BALANCED,
    });

    expect(parsed.kind).toBe('artist_mix');
    expect(parsed.tracksPerSeed).toBe(10);
    expect(parsed.popularity).toBe(PopularityMode.BALANCED);
    expect(parsed.orderMode).toBe(TrackOrderMode.RANDOM);
    expect(parsed.name).toBe('');
    expect(parsed.description).toBe('');
  });

  it('accepts client artist snapshots', () => {
    const parsed = GenerateArtistMixSchema.parse({
      kind: 'artist_mix',
      artistIds: ['a1'],
      tracksPerSeed: 20,
      popularity: PopularityMode.POPULAR,
      artists: [{ id: 'a1', name: 'Sade', imageUrl: null }],
    });
    expect(parsed.artists?.[0]?.name).toBe('Sade');
  });

  it('rejects empty artistIds', () => {
    expect(() =>
      GenerateArtistMixSchema.parse({
        kind: 'artist_mix',
        artistIds: [],
        tracksPerSeed: 10,
        popularity: PopularityMode.BALANCED,
      }),
    ).toThrow();
  });

  it('requires the artist mix discriminator and track count', () => {
    expect(() =>
      GenerateArtistMixSchema.parse({
        artistIds: ['a1'],
        popularity: PopularityMode.BALANCED,
      }),
    ).toThrow();
  });

  it.each([
    ['userId', 'user-1'],
    ['persistToLibrary', true],
    ['coverImageBase64', 'aGVsbG8='],
  ])('rejects the publication-only field %s', (field, value) => {
    expect(() =>
      GenerateArtistMixSchema.parse({
        kind: 'artist_mix',
        artistIds: ['a1'],
        tracksPerSeed: 10,
        popularity: PopularityMode.BALANCED,
        [field]: value,
      }),
    ).toThrow();
  });
});
