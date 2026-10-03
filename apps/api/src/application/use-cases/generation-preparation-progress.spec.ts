import { PopularityMode } from '@blendify/contracts';
import type { GenerationProgress } from '@blendify/contracts';
import type { GenreTrackCatalogService } from '@/application/services/genre-track-catalog.service';
import { Artist } from '@/domain/artist/artist.entity';
import type { CatalogProviderPort } from '@/domain/repositories/catalog-provider.port';
import type {
  DiscoveryCatalogPort,
  SimilarArtistCandidate,
  SimilarTrackCandidate,
} from '@/domain/repositories/discovery-catalog.port';
import { discoverSimilarTargetForTracks } from '@/domain/playlist/discover-playlist-name';
import { Track } from '@/domain/track/track.entity';
import { ArtistId } from '@/domain/value-objects/artist-id.vo';
import { TrackId } from '@/domain/value-objects/track-id.vo';
import { GenerateArtistMixUseCase } from './generate-artist-mix.use-case';
import { GenerateDiscoverPlaylistUseCase } from './generate-discover-playlist.use-case';
import { GenerateGenreMixUseCase } from './generate-genre-mix.use-case';

function makeTrack(artistName: string, trackName: string): Track {
  const id = `${artistName}-${trackName}`
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-');
  return Track.create({
    id: TrackId.create(id),
    name: trackName,
    artistId: ArtistId.create(artistName.toLowerCase().replaceAll(' ', '-')),
    artistName,
    durationMs: 200_000,
    popularity: 40,
    uri: `spotify:track:${id}`,
  });
}

async function settle(): Promise<void> {
  for (let step = 0; step < 10; step += 1) {
    await Promise.resolve();
  }
}

function resolving(events: GenerationProgress[]): GenerationProgress[] {
  return events.filter((event) => event.phase === 'resolving_seeds');
}

describe('preparation progress', () => {
  it('moves an artist mix across the selected artists on one denominator', async () => {
    const events: GenerationProgress[] = [];
    const artist = Artist.create({
      id: ArtistId.create('artist-1'),
      name: 'Sade',
    });
    const catalog = {
      searchTracks: jest.fn((query: string) =>
        Promise.resolve(
          query.includes('Sade')
            ? [
                Track.create({
                  id: TrackId.create('track-1'),
                  name: 'Smooth Operator',
                  artistId: ArtistId.create('artist-1'),
                  artistName: 'Sade',
                  durationMs: 200_000,
                  popularity: 40,
                  uri: 'spotify:track:track-1',
                }),
              ]
            : [],
        ),
      ),
    } as unknown as CatalogProviderPort;
    const useCase = new GenerateArtistMixUseCase(
      { forMarket: () => catalog },
      { assertAvailable: jest.fn() },
      { isConfigured: () => false } as unknown as DiscoveryCatalogPort,
    );

    await useCase.execute(
      {
        kind: 'artist_mix',
        artistIds: [artist.id.getValue(), 'artist-2'],
        artists: [
          { id: artist.id.getValue(), name: artist.name },
          { id: 'artist-2', name: 'Tracey Thorn' },
        ],
        tracksPerSeed: 1,
        popularity: PopularityMode.BALANCED,
      },
      {
        onProgress: (event) => {
          events.push(event);
        },
      },
    );

    expect(
      resolving(events).map((event) => [
        event.current,
        event.total,
        event.percent,
      ]),
    ).toEqual([
      [0, 2, 0],
      [1, 2, 5],
      [2, 2, 10],
    ]);
    expect(
      events.find((event) => event.phase === 'matching_tracks'),
    ).toMatchObject({
      current: 0,
      total: 2,
      percent: 10,
      etaSeconds: null,
    });
    expect(events.every((event) => event.etaSeconds === null)).toBe(true);
  });

  it('completes genre preparation in one local step', async () => {
    const events: GenerationProgress[] = [];
    const resolve = jest
      .fn()
      .mockRejectedValue(new Error('stop after progress'));
    const useCase = new GenerateGenreMixUseCase(
      { forMarket: () => ({}) } as never,
      { resolve } as unknown as GenreTrackCatalogService,
    );

    await expect(
      useCase.execute(
        {
          kind: 'genre_mix',
          genreIds: ['bossa nova', 'alternative rock'],
          tracksPerSeed: 5,
          popularity: PopularityMode.BALANCED,
        },
        {
          onProgress: (event) => {
            events.push(event);
          },
        },
      ),
    ).rejects.toThrow('stop after progress');

    expect(resolving(events)).toEqual([
      expect.objectContaining({
        current: 2,
        total: 2,
        percent: 10,
        etaSeconds: null,
      }),
    ]);
    expect(
      events.find((event) => event.phase === 'matching_tracks'),
    ).toMatchObject({
      current: 0,
      total: 10,
      percent: 10,
      etaSeconds: null,
    });
  });

  it('keeps discover artist preparation on one denominator while Last.fm is in flight', async () => {
    const events: GenerationProgress[] = [];
    const targetTrackCount = 10;
    const preparationTotal =
      1 + discoverSimilarTargetForTracks(targetTrackCount);
    let releaseSimilar: (artists: SimilarArtistCandidate[]) => void = () =>
      undefined;
    const similarGate = new Promise<SimilarArtistCandidate[]>((resolve) => {
      releaseSimilar = resolve;
    });
    const artistMix = {
      execute: jest.fn().mockResolvedValue({ kept: true }),
    };
    const catalog = {
      getArtistsByIds: jest
        .fn()
        .mockResolvedValue([
          Artist.create({ id: ArtistId.create('sade'), name: 'Sade' }),
        ]),
      searchArtists: jest.fn((name: string) =>
        Promise.resolve([
          Artist.create({
            id: ArtistId.create(
              name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-'),
            ),
            name,
          }),
        ]),
      ),
    };
    const discovery = {
      isConfigured: () => true,
      getSimilarArtists: jest.fn(() => similarGate),
    };
    const useCase = new GenerateDiscoverPlaylistUseCase(
      artistMix as unknown as GenerateArtistMixUseCase,
      discovery as unknown as DiscoveryCatalogPort,
      { forMarket: () => catalog as unknown as CatalogProviderPort },
      { assertAvailable: jest.fn() },
    );
    const outcome = useCase
      .execute(
        {
          kind: 'discover_artist',
          artistId: 'sade',
          artist: { id: 'sade', name: 'Sade' },
          targetTrackCount,
          popularity: PopularityMode.BALANCED,
        },
        {
          onProgress: (event) => {
            events.push(event);
          },
        },
      )
      .then(
        (playlist) => ({ playlist, error: null as unknown }),
        (error: unknown) => ({ playlist: null, error }),
      );

    try {
      await settle();
      const duringLookup = resolving(events);
      expect(duringLookup.map((event) => event.current)).toEqual([0, 1]);
      expect(
        duringLookup.every((event) => event.total === preparationTotal),
      ).toBe(true);
      expect(duringLookup.at(-1)?.percent).toBe(
        Math.round((10 * 1) / preparationTotal),
      );
      expect(duringLookup.at(-1)?.percent).toBeLessThan(10);
      expect(duringLookup.some((event) => event.total === 1)).toBe(false);

      releaseSimilar(
        Array.from({ length: 12 }, (_, index) => ({
          name: `Neighbor ${index}`,
        })),
      );
      const result = await outcome;
      if (result.error instanceof Error) {
        throw result.error;
      }
    } finally {
      releaseSimilar([]);
      await outcome.catch(() => undefined);
    }

    const prepared = resolving(events);
    expect(prepared.every((event) => event.total === preparationTotal)).toBe(
      true,
    );
    expect(prepared.map((event) => event.current)).toEqual(
      Array.from({ length: preparationTotal + 1 }, (_, index) => index),
    );
    expect(prepared.at(-1)).toMatchObject({
      current: preparationTotal,
      percent: 10,
      etaSeconds: null,
    });
    expect(events.every((event) => event.etaSeconds === null)).toBe(true);
  });

  it('holds discover track preparation until similar candidates exist', async () => {
    const events: GenerationProgress[] = [];
    const seed = makeTrack('Sade', 'Smooth Operator');
    let releaseSimilar: (tracks: SimilarTrackCandidate[]) => void = () =>
      undefined;
    const similarGate = new Promise<SimilarTrackCandidate[]>((resolve) => {
      releaseSimilar = resolve;
    });
    const kept = Array.from({ length: 6 }, (_, index) => ({
      name: `Keep ${index}`,
      artistName: `Other ${index}`,
      playcount: 1_000 - index,
    }));
    const missed = Array.from({ length: 20 }, (_, index) => ({
      name: `Miss ${index}`,
      artistName: `Far ${index}`,
      playcount: 10,
    }));
    const catalog = {
      searchTracks: jest.fn().mockResolvedValue([seed]),
      resolveTrack: jest.fn((artistName: string, trackName: string) =>
        Promise.resolve(
          trackName.startsWith('Keep')
            ? makeTrack(artistName, trackName)
            : null,
        ),
      ),
    };
    const discovery = {
      isConfigured: () => true,
      getSimilarTracks: jest.fn(() => similarGate),
      getSimilarArtists: jest.fn().mockResolvedValue([]),
      getTopTracksForArtist: jest.fn().mockResolvedValue([]),
    };
    const useCase = new GenerateDiscoverPlaylistUseCase(
      {} as GenerateArtistMixUseCase,
      discovery as unknown as DiscoveryCatalogPort,
      { forMarket: () => catalog as unknown as CatalogProviderPort },
      { assertAvailable: jest.fn() },
    );
    const outcome = useCase
      .execute(
        {
          kind: 'discover_track',
          trackId: seed.id.getValue(),
          track: {
            id: seed.id.getValue(),
            name: seed.name,
            artistId: seed.artistId.getValue(),
            artistName: seed.artistName,
          },
          targetTrackCount: 10,
          popularity: PopularityMode.BALANCED,
        },
        {
          onProgress: (event) => {
            events.push(event);
          },
        },
      )
      .then(
        (playlist) => ({ playlist, error: null as unknown }),
        (error: unknown) => ({ playlist: null, error }),
      );

    try {
      await settle();
      expect(
        resolving(events).map((event) => [
          event.current,
          event.total,
          event.percent,
        ]),
      ).toEqual([
        [0, 2, 0],
        [1, 2, 5],
      ]);
      expect(events.some((event) => event.phase === 'matching_tracks')).toBe(
        false,
      );
      expect(
        events.some((event) => event.total === 1 && event.current === 1),
      ).toBe(false);

      releaseSimilar([...kept, ...missed]);
      const result = await outcome;
      if (result.error instanceof Error) {
        throw result.error;
      }
      expect(result.playlist?.tracks).toHaveLength(6);
    } finally {
      releaseSimilar([]);
      await outcome.catch(() => undefined);
    }

    const preparedDone = resolving(events).findIndex(
      (event) => event.current === 2 && event.total === 2,
    );
    const firstMatch = events.findIndex(
      (event) => event.phase === 'matching_tracks',
    );
    expect(preparedDone).toBeGreaterThanOrEqual(0);
    expect(preparedDone).toBeLessThan(firstMatch);
    const matching = events.filter(
      (event) => event.phase === 'matching_tracks',
    );
    expect(matching[0]).toMatchObject({
      current: 0,
      total: 10,
      percent: 10,
      etaSeconds: null,
    });
    expect(matching.at(-1)).toMatchObject({
      current: 6,
      total: 10,
      percent: 58,
      etaSeconds: null,
    });
    expect(matching.some((event) => event.current === 10)).toBe(false);
    expect(events.every((event) => event.etaSeconds === null)).toBe(true);
  });
});
