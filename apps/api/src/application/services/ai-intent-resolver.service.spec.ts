import { Artist } from '@/domain/artist/artist.entity';
import type { AiIntent } from '@/domain/ai/ai-intent';
import type { CatalogProviderPort } from '@/domain/repositories/catalog-provider.port';
import { Track } from '@/domain/track/track.entity';
import { ArtistId } from '@/domain/value-objects/artist-id.vo';
import { TrackId } from '@/domain/value-objects/track-id.vo';
import { AiIntentResolver } from './ai-intent-resolver.service';

function artist(id: string, name: string): Artist {
  return Artist.create({ id: ArtistId.create(id), name });
}

function track(id: string, name: string, artistName: string): Track {
  return Track.create({
    id: TrackId.create(id),
    name,
    artistId: ArtistId.create(`${id}-artist`),
    artistName,
    durationMs: 200_000,
    popularity: 50,
    uri: `spotify:track:${id}`,
  });
}

function intent(overrides: Partial<AiIntent>): AiIntent {
  return {
    kind: 'artist_mix',
    artists: [],
    genres: [],
    seedTracks: [],
    targetTrackCount: null,
    targetDurationMinutes: null,
    mood: null,
    popularity: null,
    orderMode: null,
    excludeArtists: [],
    excludeTracks: [],
    unsupportedConstraints: [],
    ...overrides,
  };
}

function createResolver() {
  const catalog = {
    searchArtists: jest.fn<Promise<Artist[]>, [string, number?]>((name) =>
      Promise.resolve(
        name === 'Nobody Known' ? [] : [artist(name.toLowerCase(), name)],
      ),
    ),
    searchTracks: jest.fn<Promise<Track[]>, [string, object?]>(() =>
      Promise.resolve([]),
    ),
    resolveTrack: jest.fn<Promise<Track | null>, [string, string]>(() =>
      Promise.resolve(null),
    ),
    getArtistsByIds: jest.fn<Promise<Artist[]>, [string[]]>(() =>
      Promise.resolve([]),
    ),
  } satisfies CatalogProviderPort;
  const resolver = new AiIntentResolver({ forMarket: () => catalog });
  return { catalog, resolver };
}

describe('AiIntentResolver', () => {
  it('resolves supported genres from the curated catalog without provider calls', async () => {
    const { catalog, resolver } = createResolver();

    const resolution = await resolver.resolve(
      intent({ kind: 'genre_mix', genres: ['Dream Pop', 'shoegaze'] }),
    );

    expect(resolution).toEqual({
      status: 'resolved',
      seeds: {
        artists: [],
        genres: [
          { id: 'dream-pop', name: 'Dream Pop' },
          { id: 'shoegaze', name: 'Shoegaze' },
        ],
        track: null,
      },
    });
    expect(catalog.searchArtists).not.toHaveBeenCalled();
  });

  it('resolves a mood-only genre mix with no explicit genres and no provider calls', async () => {
    const { catalog, resolver } = createResolver();

    const resolution = await resolver.resolve(
      intent({ kind: 'genre_mix', mood: 'calm' }),
    );

    expect(resolution).toEqual({
      status: 'resolved',
      seeds: { artists: [], genres: [], track: null },
    });
    expect(catalog.searchArtists).not.toHaveBeenCalled();
    expect(catalog.searchTracks).not.toHaveBeenCalled();
  });

  it.each(['definitely not a genre', 'custom:anything'])(
    'reports an unknown genre: %s',
    async (name) => {
      const { resolver } = createResolver();

      const resolution = await resolver.resolve(
        intent({ kind: 'genre_mix', genres: ['shoegaze', name] }),
      );

      expect(resolution).toEqual({
        status: 'not_found',
        seedType: 'genre',
        names: [name],
      });
    },
  );

  it('resolves semantic genre expressions to canonical seeds without provider calls', async () => {
    const { catalog, resolver } = createResolver();

    const resolution = await resolver.resolve(
      intent({
        kind: 'genre_mix',
        genres: ['argentine rock', 'acoustic guitar'],
        mood: 'calm',
      }),
    );

    expect(resolution).toEqual({
      status: 'resolved',
      seeds: {
        artists: [],
        genres: [
          { id: 'argentine-rock', name: 'Argentine Rock' },
          { id: 'acoustic-guitar-cover', name: 'Acoustic Guitar Cover' },
          {
            id: 'instrumental-acoustic-guitar',
            name: 'Instrumental Acoustic Guitar',
          },
        ],
        track: null,
      },
    });
    expect(catalog.searchArtists).not.toHaveBeenCalled();
    expect(catalog.searchTracks).not.toHaveBeenCalled();
  });

  it('resolves local-language genre expressions through the curated aliases', async () => {
    const { catalog, resolver } = createResolver();

    const resolution = await resolver.resolve(
      intent({
        kind: 'genre_mix',
        genres: ['rock argentino', 'jazz brasileiro'],
      }),
    );

    expect(resolution).toEqual({
      status: 'resolved',
      seeds: {
        artists: [],
        genres: [
          { id: 'argentine-rock', name: 'Argentine Rock' },
          { id: 'brazilian-jazz', name: 'Brazilian Jazz' },
        ],
        track: null,
      },
    });
    expect(catalog.searchArtists).not.toHaveBeenCalled();
  });

  it('never executes an ambiguous genre expression', async () => {
    const { catalog, resolver } = createResolver();

    const resolution = await resolver.resolve(
      intent({ kind: 'genre_mix', genres: ['shoegaze', 'acoustic'] }),
    );

    expect(resolution).toEqual({
      status: 'not_found',
      seedType: 'genre',
      names: ['acoustic'],
    });
    expect(catalog.searchArtists).not.toHaveBeenCalled();
  });

  it('resolves artists sequentially with a strict name match', async () => {
    const { catalog, resolver } = createResolver();

    const resolution = await resolver.resolve(
      intent({ artists: ['Radiohead', 'Interpol'] }),
    );

    expect(resolution).toEqual({
      status: 'resolved',
      seeds: {
        artists: [
          { id: 'radiohead', name: 'Radiohead' },
          { id: 'interpol', name: 'Interpol' },
        ],
        genres: [],
        track: null,
      },
    });
    expect(catalog.searchArtists.mock.calls.map(([name]) => name)).toEqual([
      'Radiohead',
      'Interpol',
    ]);
  });

  it('checks before every artist lookup and stops once the check fails', async () => {
    const { catalog, resolver } = createResolver();
    const stop = new Error('lease lost');
    let lookups = 0;

    await expect(
      resolver.resolve(
        intent({ artists: ['Radiohead', 'Interpol', 'Slowdive'] }),
        () => {
          lookups += 1;
          if (lookups > 1) {
            throw stop;
          }
        },
      ),
    ).rejects.toBe(stop);
    expect(catalog.searchArtists).toHaveBeenCalledTimes(1);
  });

  it('reports artists the catalog cannot match', async () => {
    const { resolver } = createResolver();

    const resolution = await resolver.resolve(
      intent({ artists: ['Radiohead', 'Nobody Known'] }),
    );

    expect(resolution).toEqual({
      status: 'not_found',
      seedType: 'artist',
      names: ['Nobody Known'],
    });
  });

  it('resolves a seed track with its named artist', async () => {
    const { catalog, resolver } = createResolver();
    catalog.resolveTrack.mockResolvedValue(
      track('teardrop', 'Teardrop', 'Massive Attack'),
    );

    const resolution = await resolver.resolve(
      intent({
        kind: 'discover_track',
        seedTracks: [{ title: 'Teardrop', artist: 'Massive Attack' }],
      }),
    );

    expect(catalog.resolveTrack).toHaveBeenCalledWith(
      'Massive Attack',
      'Teardrop',
    );
    expect(resolution).toMatchObject({
      status: 'resolved',
      seeds: {
        track: {
          id: 'teardrop',
          name: 'Teardrop',
          artistName: 'Massive Attack',
        },
      },
    });
  });

  it('prefers an exact title match when the song artist is unknown', async () => {
    const { catalog, resolver } = createResolver();
    catalog.searchTracks.mockResolvedValue([
      track('silence', 'Silence', 'Someone Else'),
      track('live', 'Enjoy the Silence (Live)', 'Someone Else'),
      track('original', 'Enjoy the Silence', 'Depeche Mode'),
    ]);

    const resolution = await resolver.resolve(
      intent({
        kind: 'discover_track',
        seedTracks: [{ title: 'Enjoy the Silence', artist: null }],
      }),
    );

    expect(resolution).toMatchObject({
      status: 'resolved',
      seeds: { track: { id: 'original', artistName: 'Depeche Mode' } },
    });
  });

  it('falls back to a version-suffixed title but never to a different song', async () => {
    const { catalog, resolver } = createResolver();
    catalog.searchTracks.mockResolvedValue([
      track('silence', 'Silence', 'Someone Else'),
      track('remaster', 'Enjoy The Silence - 2006 Remaster', 'Depeche Mode'),
    ]);
    const request = intent({
      kind: 'discover_track',
      seedTracks: [{ title: 'Enjoy the Silence', artist: null }],
    });

    await expect(resolver.resolve(request)).resolves.toMatchObject({
      seeds: { track: { id: 'remaster' } },
    });

    catalog.searchTracks.mockResolvedValue([
      track('silence', 'Silence', 'Someone Else'),
    ]);
    await expect(resolver.resolve(request)).resolves.toMatchObject({
      status: 'not_found',
    });
  });

  it('reports a seed track the catalog cannot match', async () => {
    const { resolver } = createResolver();

    const resolution = await resolver.resolve(
      intent({
        kind: 'discover_track',
        seedTracks: [{ title: 'Imaginary Song', artist: 'Nobody Known' }],
      }),
    );

    expect(resolution).toEqual({
      status: 'not_found',
      seedType: 'track',
      names: ['Imaginary Song — Nobody Known'],
    });
  });
});
