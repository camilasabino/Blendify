import { MAX_ARTISTS, PopularityMode } from '@blendify/contracts';
import { Artist } from '@/domain/artist/artist.entity';
import { BusinessRuleError } from '@/domain/errors/business-rule.error';
import { seedResolveAttemptLimit } from '@/domain/genre/catalog-resolve';
import type { CatalogProviderPort } from '@/domain/repositories/catalog-provider.port';
import type {
  DiscoveryArtistIdentity,
  DiscoveryCatalogPort,
  SimilarTrackCandidate,
} from '@/domain/repositories/discovery-catalog.port';
import { Track } from '@/domain/track/track.entity';
import { ArtistId } from '@/domain/value-objects/artist-id.vo';
import { TrackId } from '@/domain/value-objects/track-id.vo';
import type { GenerateArtistMixUseCase } from './generate-artist-mix.use-case';
import { GenerateDiscoverPlaylistUseCase } from './generate-discover-playlist.use-case';

const TARGET = 15;
const RESOLVE_LIMIT = seedResolveAttemptLimit(TARGET);

function slug(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
}

function makeTrack(artistName: string, trackName: string): Track {
  const id = `${slug(artistName)}--${slug(trackName)}`;
  return Track.create({
    id: TrackId.create(id),
    name: trackName,
    artistId: ArtistId.create(slug(artistName)),
    artistName,
    durationMs: 200_000,
    popularity: 0,
    uri: `spotify:track:${id}`,
  });
}

const SEED = makeTrack('Sade', 'Smooth Operator');

function knownCandidates(count: number): SimilarTrackCandidate[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `Neighbor Tune ${index}`,
    artistName: `Neighbor ${index % 20}`,
    playcount: ((index * 37) % count) * 1_000,
  }));
}

function rankedNames(candidates: SimilarTrackCandidate[]): string[] {
  return candidates
    .filter((candidate) => candidate.playcount !== undefined)
    .map((candidate, index) => ({ candidate, index }))
    .sort(
      (a, b) =>
        (b.candidate.playcount ?? 0) - (a.candidate.playcount ?? 0) ||
        a.index - b.index,
    )
    .map((entry) => entry.candidate.name);
}

function setup(
  similar: SimilarTrackCandidate[],
  resolves: (trackName: string) => boolean = () => true,
) {
  const resolveTrack = jest.fn((artistName: string, trackName: string) =>
    Promise.resolve(
      resolves(trackName) ? makeTrack(artistName, trackName) : null,
    ),
  );
  const catalog = {
    searchTracks: jest.fn().mockResolvedValue([SEED]),
    resolveTrack,
  } as unknown as CatalogProviderPort;
  const discovery = {
    isConfigured: () => true,
    getSimilarTracks: jest
      .fn()
      .mockResolvedValue([
        { name: SEED.name, artistName: SEED.artistName, playcount: 99_999_999 },
        ...similar,
      ]),
    getTopTracksForArtist: jest.fn().mockResolvedValue([]),
    getSimilarArtists: jest.fn().mockResolvedValue([]),
  } as unknown as DiscoveryCatalogPort;

  const useCase = new GenerateDiscoverPlaylistUseCase(
    {} as GenerateArtistMixUseCase,
    discovery,
    { forMarket: () => catalog },
    { assertAvailable: jest.fn() },
  );

  const attemptedNames = () =>
    resolveTrack.mock.calls.map(([, trackName]) => trackName);

  return { useCase, resolveTrack, attemptedNames };
}

function execute(
  useCase: GenerateDiscoverPlaylistUseCase,
  popularity: PopularityMode,
) {
  return useCase.execute({
    kind: 'discover_track',
    trackId: SEED.id.getValue(),
    track: {
      id: SEED.id.getValue(),
      name: SEED.name,
      artistId: SEED.artistId.getValue(),
      artistName: SEED.artistName,
    },
    targetTrackCount: TARGET,
    popularity,
  });
}

describe('GenerateDiscoverPlaylistUseCase discover_track familiarity', () => {
  const similar = knownCandidates(100);
  const ranked = rankedNames(similar);

  it('resolves popular candidates only from the upper playcount window', async () => {
    const upper = new Set(ranked.slice(0, 40));
    const context = setup(similar);

    const playlist = await execute(context.useCase, PopularityMode.POPULAR);

    expect(playlist.tracks).toHaveLength(TARGET);
    expect(context.attemptedNames().every((name) => upper.has(name))).toBe(
      true,
    );
  });

  it('resolves rarities candidates only from the lower playcount window', async () => {
    const lower = new Set(ranked.slice(60));
    const context = setup(similar);

    const playlist = await execute(context.useCase, PopularityMode.RARITIES);

    expect(playlist.tracks).toHaveLength(TARGET);
    expect(context.attemptedNames().every((name) => lower.has(name))).toBe(
      true,
    );
  });

  it('does not resolve unknown-playcount candidates as rarities', async () => {
    const mixed: SimilarTrackCandidate[] = [
      ...Array.from({ length: 30 }, (_, index) => ({
        name: `Unknown Tune ${index}`,
        artistName: `Unknown ${index % 10}`,
      })),
      ...knownCandidates(69),
    ];
    const context = setup(mixed);

    await execute(context.useCase, PopularityMode.RARITIES);

    expect(
      context.attemptedNames().some((name) => name.startsWith('Unknown')),
    ).toBe(false);
  });

  it.each(Object.values(PopularityMode))(
    'keeps resolving past misses within the bounded resolve limit in %s mode',
    async (mode) => {
      const context = setup(similar, (name) => Number(name.at(-1)) % 2 === 0);

      const playlist = await execute(context.useCase, mode);

      expect(playlist.tracks).toHaveLength(TARGET);
      expect(context.resolveTrack.mock.calls.length).toBeLessThanOrEqual(
        RESOLVE_LIMIT,
      );
    },
  );

  it.each(Object.values(PopularityMode))(
    'stops resolving once the target is filled in %s mode',
    async (mode) => {
      const context = setup(similar);

      await execute(context.useCase, mode);

      expect(context.resolveTrack).toHaveBeenCalledTimes(TARGET);
    },
  );

  it.each(Object.values(PopularityMode))(
    'excludes the seed track in %s mode',
    async (mode) => {
      const context = setup(similar);

      const playlist = await execute(context.useCase, mode);

      expect(context.attemptedNames()).not.toContain(SEED.name);
      expect(playlist.tracks.some((track) => track.id.equals(SEED.id))).toBe(
        false,
      );
    },
  );

  it('fails once the bounded resolve limit is spent without enough matches', async () => {
    const context = setup(similar, () => false);

    await expect(
      execute(context.useCase, PopularityMode.POPULAR),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(context.resolveTrack).toHaveBeenCalledTimes(RESOLVE_LIMIT);
  });
});

describe('GenerateDiscoverPlaylistUseCase intermediate targets', () => {
  const intermediate = {
    targetTrackCount: 23,
    popularity: PopularityMode.BALANCED,
    orderMode: 'random' as const,
  };

  it('returns exactly the requested track count when the pool can fill it', async () => {
    const context = setup(knownCandidates(80));

    const playlist = await context.useCase.execute({
      kind: 'discover_track',
      trackId: SEED.id.getValue(),
      track: {
        id: SEED.id.getValue(),
        name: SEED.name,
        artistId: SEED.artistId.getValue(),
        artistName: SEED.artistName,
      },
      ...intermediate,
    });

    expect(playlist.tracks).toHaveLength(23);
    expect(playlist.generation).toMatchObject({
      kind: 'discover_track',
      targetTrackCount: 23,
    });
  });

  it('keeps the requested count when fewer similar tracks resolve', async () => {
    const context = setup(
      knownCandidates(8),
      (name) => Number(name.at(-1)) < 6,
    );

    const playlist = await context.useCase.execute({
      kind: 'discover_track',
      trackId: SEED.id.getValue(),
      track: {
        id: SEED.id.getValue(),
        name: SEED.name,
        artistId: SEED.artistId.getValue(),
        artistName: SEED.artistName,
      },
      ...intermediate,
    });

    expect(playlist.tracks).toHaveLength(6);
    expect(playlist.tracks.length).toBeLessThan(23);
    expect(playlist.generation).toMatchObject({
      kind: 'discover_track',
      targetTrackCount: 23,
    });
  });

  it('passes an intermediate artist target through without snapping to a preset', async () => {
    const artistMix = { execute: jest.fn().mockResolvedValue({ kept: true }) };
    const catalog = {
      getArtistsByIds: jest
        .fn()
        .mockResolvedValue([
          Artist.create({ id: ArtistId.create('sade'), name: 'Sade' }),
        ]),
      searchArtists: jest.fn((name: string) =>
        Promise.resolve([
          Artist.create({
            id: ArtistId.create(name.toLowerCase().replaceAll(' ', '-')),
            name,
          }),
        ]),
      ),
    };
    const discovery = {
      isConfigured: () => true,
      getSimilarArtists: jest
        .fn()
        .mockResolvedValue([
          { name: 'Tracey Thorn' },
          { name: 'Everything But The Girl' },
          { name: 'Maxwell' },
        ]),
    };
    const useCase = new GenerateDiscoverPlaylistUseCase(
      artistMix as unknown as GenerateArtistMixUseCase,
      discovery as unknown as DiscoveryCatalogPort,
      { forMarket: () => catalog as unknown as CatalogProviderPort },
      { assertAvailable: jest.fn() },
    );

    const result = await useCase.execute({
      kind: 'discover_artist',
      artistId: 'sade',
      artist: { id: 'sade', name: 'Sade' },
      ...intermediate,
    });

    expect(result).toEqual({ kept: true });
    const [mixInput] = artistMix.execute.mock.calls[0] as [
      {
        kind: string;
        maxTracks: number;
        tracksPerSeed: number;
        generation: { kind: string; targetTrackCount: number };
      },
    ];
    expect(mixInput).toMatchObject({
      kind: 'artist_mix',
      maxTracks: 23,
      tracksPerSeed: 8,
      generation: {
        kind: 'discover_artist',
        targetTrackCount: 23,
      },
    });
  });

  it.each([1, 10])(
    'returns exactly %s tracks when the pool can fill that target',
    async (targetTrackCount) => {
      const context = setup(knownCandidates(80));

      const playlist = await context.useCase.execute({
        kind: 'discover_track',
        trackId: SEED.id.getValue(),
        track: {
          id: SEED.id.getValue(),
          name: SEED.name,
          artistId: SEED.artistId.getValue(),
          artistName: SEED.artistName,
        },
        targetTrackCount,
        popularity: PopularityMode.BALANCED,
        orderMode: 'random',
      });

      expect(playlist.tracks).toHaveLength(targetTrackCount);
      expect(playlist.tracks.length).toBeLessThanOrEqual(targetTrackCount);
      expect(playlist.generation).toMatchObject({
        kind: 'discover_track',
        targetTrackCount,
      });
    },
  );

  it('accepts a single resolved neighbor when the target is 1', async () => {
    const context = setup(knownCandidates(1));

    const playlist = await context.useCase.execute({
      kind: 'discover_track',
      trackId: SEED.id.getValue(),
      track: {
        id: SEED.id.getValue(),
        name: SEED.name,
        artistId: SEED.artistId.getValue(),
        artistName: SEED.artistName,
      },
      targetTrackCount: 1,
      popularity: PopularityMode.BALANCED,
      orderMode: 'random',
    });

    expect(playlist.tracks).toHaveLength(1);
    expect(playlist.generation).toMatchObject({ targetTrackCount: 1 });
  });

  it('still rejects a short track pool when the target is above the resolution floor', async () => {
    const context = setup(knownCandidates(8), () => false);

    await expect(
      context.useCase.execute({
        kind: 'discover_track',
        trackId: SEED.id.getValue(),
        track: {
          id: SEED.id.getValue(),
          name: SEED.name,
          artistId: SEED.artistId.getValue(),
          artistName: SEED.artistName,
        },
        targetTrackCount: 10,
        popularity: PopularityMode.BALANCED,
        orderMode: 'random',
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('asks the artist mix for exactly one track when the target is 1', async () => {
    const artistMix = { execute: jest.fn().mockResolvedValue({ kept: true }) };
    const catalog = {
      getArtistsByIds: jest
        .fn()
        .mockResolvedValue([
          Artist.create({ id: ArtistId.create('sade'), name: 'Sade' }),
        ]),
      searchArtists: jest.fn((name: string) =>
        Promise.resolve([
          Artist.create({
            id: ArtistId.create(name.toLowerCase().replaceAll(' ', '-')),
            name,
          }),
        ]),
      ),
    };
    const discovery = {
      isConfigured: () => true,
      getSimilarArtists: jest
        .fn()
        .mockResolvedValue([
          { name: 'Tracey Thorn' },
          { name: 'Everything But The Girl' },
          { name: 'Maxwell' },
        ]),
    };
    const useCase = new GenerateDiscoverPlaylistUseCase(
      artistMix as unknown as GenerateArtistMixUseCase,
      discovery as unknown as DiscoveryCatalogPort,
      { forMarket: () => catalog as unknown as CatalogProviderPort },
      { assertAvailable: jest.fn() },
    );

    await useCase.execute({
      kind: 'discover_artist',
      artistId: 'sade',
      artist: { id: 'sade', name: 'Sade' },
      targetTrackCount: 1,
      popularity: PopularityMode.BALANCED,
      orderMode: 'random',
    });

    const [mixInput] = artistMix.execute.mock.calls[0] as [
      {
        artistIds: string[];
        maxTracks: number;
        tracksPerSeed: number;
        generation: { kind: string; targetTrackCount: number };
      },
    ];
    expect(mixInput.artistIds).toHaveLength(2);
    expect(mixInput).toMatchObject({
      maxTracks: 1,
      tracksPerSeed: 1,
      generation: {
        kind: 'discover_artist',
        targetTrackCount: 1,
      },
    });
  });
});

describe('GenerateDiscoverPlaylistUseCase discover_artist similarity depth', () => {
  const similar = Array.from({ length: 40 }, (_, index) => ({
    name: `Similar ${index + 1}`,
  }));

  function rankOf(name: string): number {
    return Number(name.replace('Similar ', ''));
  }

  function band(name: string): 'head' | 'middle' | 'tail' {
    const rank = rankOf(name);
    if (rank <= 10) {
      return 'head';
    }
    return rank <= 25 ? 'middle' : 'tail';
  }

  function setupArtistDiscover(
    misses: Set<string> = new Set(),
    homonyms: Set<string> = new Set(),
  ) {
    const artistMix = { execute: jest.fn().mockResolvedValue({ kept: true }) };
    const catalog = {
      getArtistsByIds: jest
        .fn()
        .mockResolvedValue([
          Artist.create({ id: ArtistId.create('sade'), name: 'Sade' }),
        ]),
      searchArtists: jest.fn((name: string) => {
        if (misses.has(name)) {
          return Promise.resolve([]);
        }
        if (homonyms.has(name)) {
          return Promise.resolve(
            ['a', 'b'].map((suffix) =>
              Artist.create({
                id: ArtistId.create(`${slug(name)}-${suffix}`),
                name,
              }),
            ),
          );
        }
        return Promise.resolve([
          Artist.create({ id: ArtistId.create(slug(name)), name }),
        ]);
      }),
    };
    const discovery = {
      isConfigured: () => true,
      getSimilarArtists: jest.fn().mockResolvedValue(similar),
    };
    const useCase = new GenerateDiscoverPlaylistUseCase(
      artistMix as unknown as GenerateArtistMixUseCase,
      discovery as unknown as DiscoveryCatalogPort,
      { forMarket: () => catalog as unknown as CatalogProviderPort },
      { assertAvailable: jest.fn() },
    );

    const run = async (
      popularity: PopularityMode = PopularityMode.BALANCED,
    ) => {
      await useCase.execute({
        kind: 'discover_artist',
        artistId: 'sade',
        artist: { id: 'sade', name: 'Sade' },
        targetTrackCount: 50,
        popularity,
        orderMode: 'random',
      });
      const [mixInput] = artistMix.execute.mock.lastCall as [
        { artists: Array<{ name: string }>; popularity: PopularityMode },
      ];
      return mixInput;
    };
    const searched = () =>
      catalog.searchArtists.mock.calls.map(([name]) => name);

    return { run, searched, discovery };
  }

  it('draws a bounded artist set from every similarity band of the 40 candidates', async () => {
    const context = setupArtistDiscover();

    const mixInput = await context.run();

    expect(context.discovery.getSimilarArtists).toHaveBeenCalledWith(
      'Sade',
      40,
    );
    const names = mixInput.artists.map((artist) => artist.name);
    expect(names).toHaveLength(MAX_ARTISTS);
    expect(names).not.toEqual(
      similar.slice(0, MAX_ARTISTS).map((artist) => artist.name),
    );
    const bands = names.map(band);
    const count = (name: string) => bands.filter((b) => b === name).length;
    expect(count('tail')).toBeGreaterThan(0);
    expect(count('middle')).toBeGreaterThan(count('tail'));
    expect(count('head')).toBeGreaterThan(count('middle'));
  });

  it('continues through the diversified order when Spotify misses a candidate', async () => {
    const misses = new Set(['Similar 1', 'Similar 11', 'Similar 26']);
    const context = setupArtistDiscover(misses);

    const mixInput = await context.run();

    const names = mixInput.artists.map((artist) => artist.name);
    expect(names).toHaveLength(MAX_ARTISTS);
    expect(names.some((name) => misses.has(name))).toBe(false);
    expect(context.searched()).toHaveLength(MAX_ARTISTS + misses.size);
    expect(new Set(context.searched().map(band))).toEqual(
      new Set(['head', 'middle', 'tail']),
    );
  });

  it('skips a similar artist with several exact Spotify homonyms', async () => {
    const homonyms = new Set(['Similar 1', 'Similar 11', 'Similar 26']);
    const context = setupArtistDiscover(new Set(), homonyms);

    const mixInput = await context.run();

    const names = mixInput.artists.map((artist) => artist.name);
    expect(names).toHaveLength(MAX_ARTISTS);
    expect(names.some((name) => homonyms.has(name))).toBe(false);
    expect(context.searched()).toHaveLength(MAX_ARTISTS + homonyms.size);
  });

  it('keeps the same artists for every popularity mode and passes it to the mix', async () => {
    const modes = [
      PopularityMode.POPULAR,
      PopularityMode.BALANCED,
      PopularityMode.RARITIES,
    ];
    const results = [];
    for (const mode of modes) {
      results.push(await setupArtistDiscover().run(mode));
    }

    const [first, ...rest] = results.map((input) =>
      input.artists.map((artist) => artist.name),
    );
    for (const names of rest) {
      expect(names).toEqual(first);
    }
    expect(results.map((input) => input.popularity)).toEqual(modes);
  });
});

describe('GenerateDiscoverPlaylistUseCase seed snapshot popularity', () => {
  async function seedPopularity(
    popularity?: number | null,
  ): Promise<number | null | undefined> {
    const context = setup(knownCandidates(20));
    context.resolveTrack.mockImplementation(
      (artistName: string, trackName: string) => {
        if (trackName === SEED.name) {
          return Promise.resolve(null);
        }
        return Promise.resolve(makeTrack(artistName, trackName));
      },
    );
    const catalog = {
      searchTracks: jest.fn().mockResolvedValue([]),
      resolveTrack: context.resolveTrack,
    } as unknown as CatalogProviderPort;
    const useCase = new GenerateDiscoverPlaylistUseCase(
      {} as GenerateArtistMixUseCase,
      {
        isConfigured: () => true,
        getSimilarTracks: jest.fn().mockResolvedValue(knownCandidates(20)),
        getTopTracksForArtist: jest.fn().mockResolvedValue([]),
        getSimilarArtists: jest.fn().mockResolvedValue([]),
      } as unknown as DiscoveryCatalogPort,
      { forMarket: () => catalog },
      { assertAvailable: jest.fn() },
    );

    const playlist = await useCase.execute({
      kind: 'discover_track',
      trackId: SEED.id.getValue(),
      track: {
        id: SEED.id.getValue(),
        name: SEED.name,
        artistId: SEED.artistId.getValue(),
        artistName: SEED.artistName,
        uri: SEED.uri,
        ...(popularity === undefined ? {} : { popularity }),
      },
      targetTrackCount: 10,
      popularity: PopularityMode.BALANCED,
      orderMode: 'random',
    });
    const seed = playlist.seeds[0];
    return seed?.type === 'track' ? seed.popularity : undefined;
  }

  it('keeps a measured snapshot, a real zero, and an omitted snapshot distinct', async () => {
    await expect(seedPopularity(73)).resolves.toBe(73);
    await expect(seedPopularity(0)).resolves.toBe(0);
    await expect(seedPopularity()).resolves.toBeNull();
    await expect(seedPopularity(null)).resolves.toBeNull();
  });
});

describe('GenerateDiscoverPlaylistUseCase seed artist share', () => {
  const BERRA = makeTrack('Adrián Berra', 'Un Beso en la Nariz');
  const SERU = makeTrack('Serú Girán', 'Seminare');

  type Fixture = {
    seed: Track;
    similarTracks?: SimilarTrackCandidate[];
    similarArtists?: string[];
    topTracks?: Record<string, number>;
    resolve?: (artistName: string, trackName: string) => Track | null;
  };

  function discoverCase(fixture: Fixture) {
    const resolveTrack = jest.fn((artistName: string, trackName: string) =>
      Promise.resolve(
        fixture.resolve
          ? fixture.resolve(artistName, trackName)
          : makeTrack(artistName, trackName),
      ),
    );
    const getTopTracksForArtist = jest.fn(
      ({ name: artistName }: DiscoveryArtistIdentity) =>
        Promise.resolve(
          Array.from(
            { length: fixture.topTracks?.[artistName] ?? 0 },
            (_, index) => ({
              artistName,
              trackName: `${artistName} Hit ${index}`,
              playcount: 50_000 - index * 1_000,
            }),
          ),
        ),
    );
    const getSimilarArtists = jest
      .fn()
      .mockResolvedValue(
        (fixture.similarArtists ?? []).map((name) => ({ name })),
      );
    const catalog = {
      searchTracks: jest.fn().mockResolvedValue([fixture.seed]),
      resolveTrack,
    } as unknown as CatalogProviderPort;
    const discovery = {
      isConfigured: () => true,
      getSimilarTracks: jest
        .fn()
        .mockResolvedValue(fixture.similarTracks ?? []),
      getTopTracksForArtist,
      getSimilarArtists,
    } as unknown as DiscoveryCatalogPort;
    const useCase = new GenerateDiscoverPlaylistUseCase(
      {} as GenerateArtistMixUseCase,
      discovery,
      { forMarket: () => catalog },
      { assertAvailable: jest.fn() },
    );

    const run = (targetTrackCount = TARGET) =>
      useCase.execute({
        kind: 'discover_track',
        market: 'AR',
        trackId: fixture.seed.id.getValue(),
        track: {
          id: fixture.seed.id.getValue(),
          name: fixture.seed.name,
          artistId: fixture.seed.artistId.getValue(),
          artistName: fixture.seed.artistName,
        },
        targetTrackCount,
        popularity: PopularityMode.BALANCED,
        orderMode: 'random',
      });

    return { run, resolveTrack, getTopTracksForArtist, getSimilarArtists };
  }

  function candidates(artistName: string, count: number, offset = 0) {
    return Array.from({ length: count }, (_, index) => ({
      name: `${artistName} Song ${index + offset}`,
      artistName,
      playcount: 10_000 + index,
    }));
  }

  function neighbors(count: number): SimilarTrackCandidate[] {
    return Array.from({ length: count }, (_, index) => ({
      name: `Neighbor Song ${index}`,
      artistName: `Neighbor ${index}`,
      playcount: 10_000 + index,
    }));
  }

  function seedArtistCount(tracks: readonly Track[], seed: Track): number {
    return tracks.filter((track) => track.artistId.equals(seed.artistId))
      .length;
  }

  function rejectionCode(promise: Promise<unknown>) {
    return promise.then(
      () => null,
      (error: BusinessRuleError) => error.code,
    );
  }

  it('fills an empty similar-track answer from similar artists instead of the seed artist', async () => {
    const context = discoverCase({
      seed: BERRA,
      similarArtists: ['Kevin Johansen', 'Jorge Drexler', 'Coti', 'Juanse'],
      topTracks: {
        'Adrián Berra': 20,
        'Kevin Johansen': 8,
        'Jorge Drexler': 8,
        Coti: 8,
        Juanse: 8,
      },
    });

    const playlist = await context.run();

    expect(playlist.tracks).toHaveLength(TARGET);
    expect(seedArtistCount(playlist.tracks, BERRA)).toBe(0);
    expect(
      new Set(playlist.tracks.map((track) => track.artistId.getValue())).size,
    ).toBeGreaterThan(1);
    expect(context.getTopTracksForArtist).not.toHaveBeenCalledWith(
      { name: 'Adrián Berra' },
      expect.any(Number),
    );
  });

  it('rejects a seed-artist-only pool before resolving any track on Spotify', async () => {
    const context = discoverCase({
      seed: BERRA,
      topTracks: { 'Adrián Berra': 20 },
    });

    await expect(rejectionCode(context.run())).resolves.toBe(
      'DISCOVER_NOT_ENOUGH_SIMILAR',
    );
    expect(context.getSimilarArtists).toHaveBeenCalled();
    expect(context.resolveTrack).not.toHaveBeenCalled();
  });

  it('keeps a varied similar-track answer without fallbacks', async () => {
    const context = discoverCase({
      seed: SERU,
      similarTracks: [
        ...candidates('Charly García', 4),
        ...candidates('Luis Alberto Spinetta', 3),
        ...candidates('Sui Generis', 3),
        ...candidates('Pescado Rabioso', 3),
        ...candidates('Fito Páez', 2),
        ...candidates('León Gieco', 2),
        ...candidates('Serú Girán', 3),
      ],
    });

    const playlist = await context.run();

    expect(playlist.tracks).toHaveLength(TARGET);
    expect(
      new Set(playlist.tracks.map((track) => track.artistId.getValue())).size,
    ).toBeGreaterThanOrEqual(6);
    expect(seedArtistCount(playlist.tracks, SERU)).toBe(0);
    expect(context.getSimilarArtists).not.toHaveBeenCalled();
    expect(context.getTopTracksForArtist).not.toHaveBeenCalled();
  });

  it.each([
    { target: 1, related: 1, seed: 5, tracks: 1, fromSeed: 0 },
    { target: 1, related: 0, seed: 5, tracks: null, fromSeed: 0 },
    { target: 3, related: 2, seed: 5, tracks: null, fromSeed: 0 },
    { target: 4, related: 3, seed: 5, tracks: 4, fromSeed: 1 },
    { target: 15, related: 9, seed: 10, tracks: 12, fromSeed: 3 },
    { target: 50, related: 40, seed: 20, tracks: 50, fromSeed: 10 },
    { target: 50, related: 50, seed: 20, tracks: 50, fromSeed: 0 },
  ])(
    'caps seed-artist tracks for target $target with $related related candidate(s)',
    async ({ target, related, seed, tracks, fromSeed }) => {
      const context = discoverCase({
        seed: BERRA,
        similarTracks: [
          ...neighbors(related),
          ...candidates('Adrián Berra', seed),
        ],
        topTracks: { 'Adrián Berra': 0 },
      });

      if (tracks === null) {
        await expect(rejectionCode(context.run(target))).resolves.toBe(
          'DISCOVER_NOT_ENOUGH_SIMILAR',
        );
        return;
      }

      const playlist = await context.run(target);

      expect(playlist.tracks).toHaveLength(tracks);
      expect(seedArtistCount(playlist.tracks, BERRA)).toBe(fromSeed);
    },
  );

  it('counts a Spotify co-credit with the seed artist as the seed artist', async () => {
    const context = discoverCase({
      seed: BERRA,
      similarTracks: neighbors(8),
      resolve: (artistName, trackName) => {
        const base = makeTrack(artistName, trackName);
        if (Number(trackName.at(-1)) % 2 === 1) {
          return base;
        }
        return Track.create({
          id: base.id,
          name: base.name,
          artistId: base.artistId,
          artistName,
          durationMs: base.durationMs,
          popularity: base.popularity,
          uri: base.uri,
          artists: [
            { id: base.artistId.getValue(), name: artistName },
            { id: BERRA.artistId.getValue(), name: BERRA.artistName },
          ],
        });
      },
    });

    const playlist = await context.run(8);

    const coCredited = playlist.tracks.filter((track) =>
      track.artists.some((artist) => artist.id === BERRA.artistId.getValue()),
    );
    expect(playlist.tracks).toHaveLength(5);
    expect(coCredited).toHaveLength(1);
  });
});
