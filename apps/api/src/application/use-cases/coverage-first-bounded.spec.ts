import { PopularityMode } from '@blendify/contracts';
import { Artist } from '@/domain/artist/artist.entity';
import { BusinessRuleError } from '@/domain/errors/business-rule.error';
import type { CatalogProviderPort } from '@/domain/repositories/catalog-provider.port';
import type { DiscoveryCatalogPort } from '@/domain/repositories/discovery-catalog.port';
import { ArtistId } from '@/domain/value-objects/artist-id.vo';
import { seedResolveAttemptLimit } from '@/domain/genre/catalog-resolve';
import { ARTIST_MIX_WORK_POLICY } from './artist-mix-work-policy';
import { GenerateDiscoverPlaylistUseCase } from './generate-discover-playlist.use-case';
import { GeneratePlaylistUseCase } from './generate-playlist.use-case';
import type { GenerateArtistMixUseCase } from './generate-artist-mix.use-case';
import type { GenerateGenreMixUseCase } from './generate-genre-mix.use-case';
import {
  artistSnapshot,
  createWorld,
  makeTrack,
  numbered,
  titles,
  type TrackRelease,
} from './generation-world.testing';

const BOUNDED = ARTIST_MIX_WORK_POLICY.COVERAGE_FIRST_BOUNDED;
const DECADE = { fromYear: 2020, toYear: 2026 } as const;
const FILTERS = {
  region: null,
  femaleVocals: false,
  releaseRange: DECADE,
  excludeLive: true,
} as const;

describe('coverage-first-bounded policy selection', () => {
  it('Discover Artist opts into the bounded policy', async () => {
    const { artistMix, discover } = selectionHarness();

    await discover.execute({
      kind: 'discover_artist',
      artistId: 'sade',
      artist: { id: 'sade', name: 'Sade' },
      targetTrackCount: 10,
      popularity: PopularityMode.BALANCED,
      orderMode: 'random',
    });

    expect(artistMix.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        generation: expect.objectContaining({ kind: 'discover_artist' }),
      }),
      expect.objectContaining({ workPolicy: BOUNDED }),
    );
  });

  it('direct Artist Mix stays on the legacy policy', async () => {
    const world = createWorld({
      artistCharts: { Sade: titles('Sade', 8) },
    });
    const execute = jest.spyOn(world.artistMix, 'execute');

    await world.artistMix.execute({
      kind: 'artist_mix',
      artistIds: ['sade'],
      artists: [artistSnapshot('Sade')],
      tracksPerSeed: 3,
      popularity: PopularityMode.BALANCED,
    });

    expect(execute.mock.calls[0]?.[1]?.workPolicy).toBeUndefined();
  });

  it('AI discover_artist opts in through the Discover path', async () => {
    const { artistMix, playlists } = selectionHarness();

    await playlists.execute({
      kind: 'discover_artist',
      name: '',
      description: '',
      artistId: 'sade',
      artist: { id: 'sade', name: 'Sade' },
      targetTrackCount: 10,
      popularity: PopularityMode.BALANCED,
      orderMode: 'random',
      filters: FILTERS,
    });

    expect(artistMix.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        generation: expect.objectContaining({ kind: 'discover_artist' }),
      }),
      expect.objectContaining({ workPolicy: BOUNDED }),
    );
  });

  it('AI artist_mix stays on the legacy path', async () => {
    const { artistMix, playlists } = selectionHarness();

    await playlists.execute({
      kind: 'artist_mix',
      name: '',
      description: '',
      artistIds: ['sade'],
      artists: [artistSnapshot('Sade')],
      tracksPerSeed: 3,
      popularity: PopularityMode.BALANCED,
      orderMode: 'random',
      filters: FILTERS,
    });

    expect(artistMix.execute).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'artist_mix' }),
      undefined,
    );
    expect(artistMix.execute.mock.calls[0]?.[1]?.workPolicy).toBeUndefined();
  });
});

describe('coverage-first-bounded scheduling', () => {
  beforeEach(() => {
    jest.spyOn(Math, 'random').mockReturnValue(0.999);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('gives every artist a resolve before any surplus', async () => {
    const names = numbered('Act', 3);
    const world = createWorld({
      artistCharts: Object.fromEntries(
        names.map((name) => [name, titles(name, 8)]),
      ),
    });

    await world.artistMix.execute(
      {
        kind: 'artist_mix',
        artistIds: names.map((name) => artistSnapshot(name).id),
        artists: names.map(artistSnapshot),
        tracksPerSeed: 1,
        maxTracks: 3,
        popularity: PopularityMode.BALANCED,
      },
      { workPolicy: BOUNDED },
    );

    const firstRound = world.resolveTrack.mock.calls
      .slice(0, 3)
      .map(([artistName]) => artistName);
    expect(new Set(firstRound).size).toBe(3);
  });

  it('does not let one source monopolize the resolve budget', async () => {
    const names = numbered('Act', 3);
    const world = filteredWorld(
      Object.fromEntries(names.map((name) => [name, titles(name, 50)])),
      () => ({
        releaseDate: '2015-01-01',
        releaseDatePrecision: 'day',
      }),
    );

    await expect(
      world.artistMix.execute(
        {
          kind: 'artist_mix',
          artistIds: names.map((name) => artistSnapshot(name).id),
          artists: names.map(artistSnapshot),
          tracksPerSeed: 1,
          maxTracks: 3,
          popularity: PopularityMode.BALANCED,
          filters: FILTERS,
        },
        { workPolicy: BOUNDED },
      ),
    ).rejects.toMatchObject({ code: 'NO_TRACKS_FOUND' });

    const byArtist = countResolvesByArtist(world.resolveTrack.mock.calls);
    expect(Math.max(...Object.values(byArtist))).toBeLessThan(20);
    expect(Object.keys(byArtist)).toHaveLength(3);
  });

  it('keeps the chart cursor when expansion continues a source', async () => {
    const world = filteredWorld({ 'Act 1': titles('Act 1', 20) }, (index) =>
      index === 3
        ? { releaseDate: '2023-01-01', releaseDatePrecision: 'day' }
        : { releaseDate: '2015-01-01', releaseDatePrecision: 'day' },
    );

    const playlist = await world.artistMix.execute(
      {
        kind: 'artist_mix',
        artistIds: ['act-1'],
        artists: [artistSnapshot('Act 1')],
        tracksPerSeed: 1,
        popularity: PopularityMode.BALANCED,
        filters: FILTERS,
      },
      { workPolicy: BOUNDED },
    );

    const titlesResolved = world.resolveTrack.mock.calls.map(
      ([, title]) => title,
    );
    expect(playlist.tracks).toHaveLength(1);
    expect(playlist.tracks[0]?.name).toBe('Act 1 Song 4');
    expect(titlesResolved).toEqual([
      'Act 1 Song 1',
      'Act 1 Song 2',
      'Act 1 Song 3',
      'Act 1 Song 4',
    ]);
    expect(new Set(titlesResolved).size).toBe(titlesResolved.length);
  });
});

describe('coverage-first-bounded catalog budget', () => {
  beforeEach(() => {
    jest.spyOn(Math, 'random').mockReturnValue(0.999);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('never resolves or searches past the hard cap and stays serial', async () => {
    const names = numbered('Act', 10);
    const world = filteredWorld(
      Object.fromEntries(names.map((name) => [name, titles(name, 50)])),
      () => ({
        releaseDate: '2015-01-01',
        releaseDatePrecision: 'day',
      }),
    );
    const inFlight = { resolve: 0, search: 0, maxResolve: 0, maxSearch: 0 };
    const resolveTrack = world.catalog.resolveTrack.getMockImplementation();
    world.catalog.resolveTrack.mockImplementation(async (artistName, title) => {
      inFlight.resolve += 1;
      inFlight.maxResolve = Math.max(inFlight.maxResolve, inFlight.resolve);
      try {
        return resolveTrack
          ? await resolveTrack(artistName, title)
          : makeTrack(artistName, title);
      } finally {
        inFlight.resolve -= 1;
      }
    });
    world.catalog.searchTracks.mockImplementation(() => {
      inFlight.search += 1;
      inFlight.maxSearch = Math.max(inFlight.maxSearch, inFlight.search);
      inFlight.search -= 1;
      return Promise.resolve([]);
    });

    await expect(
      world.artistMix.execute(
        {
          kind: 'artist_mix',
          artistIds: names.map((name) => artistSnapshot(name).id),
          artists: names.map(artistSnapshot),
          tracksPerSeed: 1,
          maxTracks: 10,
          popularity: PopularityMode.BALANCED,
          filters: FILTERS,
        },
        { workPolicy: BOUNDED },
      ),
    ).rejects.toMatchObject({ code: 'NO_TRACKS_FOUND' });

    expect(world.catalog.resolveTrack.mock.calls.length).toBeLessThanOrEqual(
      60,
    );
    expect(world.catalog.searchTracks.mock.calls.length).toBeLessThanOrEqual(
      10,
    );
    expect(
      world.catalog.resolveTrack.mock.calls.length +
        world.catalog.searchTracks.mock.calls.length,
    ).toBeLessThanOrEqual(70);
    expect(inFlight.maxResolve).toBe(1);
    expect(inFlight.maxSearch).toBe(1);
  });
});

describe('coverage-first-bounded fallback', () => {
  beforeEach(() => {
    jest.spyOn(Math, 'random').mockReturnValue(0.999);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('searches at most once per insufficient source and drains the cached page', async () => {
    const world = createWorld({
      artistCharts: { 'Act 1': [], 'Act 2': [] },
      searchTracks: {
        'Act 1': titles('Act 1', 3, 10),
        'Act 2': [],
      },
    });

    const playlist = await world.artistMix.execute(
      {
        kind: 'artist_mix',
        artistIds: ['act-1', 'act-2'],
        artists: [artistSnapshot('Act 1'), artistSnapshot('Act 2')],
        tracksPerSeed: 2,
        maxTracks: 3,
        popularity: PopularityMode.BALANCED,
      },
      { workPolicy: BOUNDED },
    );

    expect(playlist.tracks.map((track) => track.name)).toEqual([
      'Act 1 Song 10',
      'Act 1 Song 11',
      'Act 1 Song 12',
    ]);
    expect(
      world.catalog.searchTracks.mock.calls.filter(([query]) =>
        String(query).includes('Act 1'),
      ),
    ).toHaveLength(1);
    expect(world.catalog.searchTracks).toHaveBeenCalledTimes(2);
  });

  it('still applies live, decade, and homonym guards to the cached fallback page', async () => {
    const world = filteredWorld(
      { 'Act 1': [] },
      () => ({
        releaseDate: '2023-01-01',
        releaseDatePrecision: 'day',
      }),
      {
        'Act 1': [
          'Act 1 Song 10',
          'Act 1 Live Night',
          'Act 1 Song 12',
          'Homonym Hit',
        ],
      },
    );
    world.catalog.searchTracks.mockImplementation((query: string) => {
      const artistName = /artist:"([^"]*)"/.exec(query)?.[1] ?? '';
      if (artistName !== 'Act 1') {
        return Promise.resolve([]);
      }
      return Promise.resolve([
        makeTrack(artistName, 'Act 1 Song 10', {
          releaseDate: '2015-01-01',
          releaseDatePrecision: 'day',
        }),
        makeTrack(artistName, 'Act 1 Live Night', {
          releaseDate: '2023-01-01',
          releaseDatePrecision: 'day',
          albumName: 'Live at the Forum',
        }),
        makeTrack(artistName, 'Act 1 Song 12', {
          releaseDate: '2023-01-01',
          releaseDatePrecision: 'day',
        }),
        makeTrack('Other Act', 'Homonym Hit', {
          releaseDate: '2023-01-01',
          releaseDatePrecision: 'day',
        }),
      ]);
    });

    const playlist = await world.artistMix.execute(
      {
        kind: 'artist_mix',
        artistIds: ['act-1'],
        artists: [artistSnapshot('Act 1')],
        tracksPerSeed: 1,
        popularity: PopularityMode.BALANCED,
        filters: FILTERS,
      },
      { workPolicy: BOUNDED },
    );

    expect(playlist.tracks).toHaveLength(1);
    expect(playlist.tracks[0]?.name).toBe('Act 1 Song 12');
    expect(playlist.tracks[0]?.artistName).toBe('Act 1');
  });
});

describe('coverage-first-bounded expansion', () => {
  beforeEach(() => {
    jest.spyOn(Math, 'random').mockReturnValue(0.999);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('covers empty quotas before growing surplus on a full source', async () => {
    const world = filteredWorld(
      {
        'Act 1': titles('Act 1', 8),
        'Act 2': titles('Act 2', 8),
        'Act 3': titles('Act 3', 8),
      },
      (index, artistName) => {
        if (artistName === 'Act 1' && index === 0) {
          return {
            releaseDate: '2023-01-01',
            releaseDatePrecision: 'day',
          };
        }
        if (artistName === 'Act 3' && index >= 0) {
          return {
            releaseDate: '2023-01-01',
            releaseDatePrecision: 'day',
          };
        }
        return {
          releaseDate: '2015-01-01',
          releaseDatePrecision: 'day',
        };
      },
    );
    const playlist = await world.artistMix.execute(
      {
        kind: 'artist_mix',
        artistIds: ['act-1', 'act-2', 'act-3'],
        artists: [
          artistSnapshot('Act 1'),
          artistSnapshot('Act 2'),
          artistSnapshot('Act 3'),
        ],
        tracksPerSeed: 1,
        maxTracks: 3,
        popularity: PopularityMode.BALANCED,
        filters: FILTERS,
      },
      { workPolicy: BOUNDED },
    );

    expect(playlist.tracks).toHaveLength(3);
    expect(
      playlist.tracks.filter((track) => track.artistName === 'Act 2'),
    ).toHaveLength(0);
    const resolveOrder = world.resolveTrack.mock.calls.map(
      ([artistName]) => artistName,
    );
    const firstSurplusFromThree = resolveOrder.findIndex(
      (artist, index) =>
        artist === 'Act 3' &&
        resolveOrder.slice(0, index).filter((name) => name === 'Act 3')
          .length >= 1,
    );
    const lastActTwo = resolveOrder.lastIndexOf('Act 2');
    expect(lastActTwo).toBeGreaterThanOrEqual(0);
    expect(firstSurplusFromThree).toBeGreaterThan(lastActTwo);
  });

  it('stops once the global target is met', async () => {
    const names = numbered('Act', 3);
    const world = createWorld({
      artistCharts: Object.fromEntries(
        names.map((name) => [name, titles(name, 20)]),
      ),
    });

    const playlist = await world.artistMix.execute(
      {
        kind: 'artist_mix',
        artistIds: names.map((name) => artistSnapshot(name).id),
        artists: names.map(artistSnapshot),
        tracksPerSeed: 1,
        maxTracks: 3,
        popularity: PopularityMode.BALANCED,
      },
      { workPolicy: BOUNDED },
    );

    expect(playlist.tracks).toHaveLength(3);
    expect(world.resolveTrack.mock.calls.length).toBe(3);
  });
});

describe('coverage-first-bounded partial semantics', () => {
  beforeEach(() => {
    jest.spyOn(Math, 'random').mockReturnValue(0.999);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the 6 valid tracks when the budget ends at 6/10', async () => {
    const names = numbered('Act', 10);
    const world = filteredWorld(
      Object.fromEntries(names.map((name) => [name, titles(name, 8)])),
      (index, artistName) => {
        const artistIndex = Number(artistName.replace('Act ', ''));
        if (artistIndex <= 6 && index === 0) {
          return {
            releaseDate: '2023-01-01',
            releaseDatePrecision: 'day',
          };
        }
        return {
          releaseDate: '2015-01-01',
          releaseDatePrecision: 'day',
        };
      },
    );

    const playlist = await world.artistMix.execute(
      {
        kind: 'artist_mix',
        artistIds: names.map((name) => artistSnapshot(name).id),
        artists: names.map(artistSnapshot),
        tracksPerSeed: 1,
        maxTracks: 10,
        popularity: PopularityMode.BALANCED,
        filters: FILTERS,
      },
      { workPolicy: BOUNDED },
    );

    expect(playlist.tracks).toHaveLength(6);
    expect(
      playlist.tracks.every(
        (track) =>
          track.releaseDate?.startsWith('2023') &&
          !/live/i.test(`${track.name} ${track.albumName ?? ''}`),
      ),
    ).toBe(true);
    expect(world.catalog.searchTracks).toHaveBeenCalledTimes(10);
  });

  it('keeps NO_TRACKS_FOUND when nothing valid is found', async () => {
    const names = numbered('Act', 10);
    const world = filteredWorld(
      Object.fromEntries(names.map((name) => [name, titles(name, 8)])),
      () => ({
        releaseDate: '2015-01-01',
        releaseDatePrecision: 'day',
      }),
    );

    const pending = world.artistMix.execute(
      {
        kind: 'artist_mix',
        artistIds: names.map((name) => artistSnapshot(name).id),
        artists: names.map(artistSnapshot),
        tracksPerSeed: 1,
        maxTracks: 10,
        popularity: PopularityMode.BALANCED,
        filters: FILTERS,
      },
      { workPolicy: BOUNDED },
    );

    await expect(pending).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(pending).rejects.toMatchObject({ code: 'NO_TRACKS_FOUND' });
  });
});

describe('legacy Artist Mix regressions', () => {
  beforeEach(() => {
    jest.spyOn(Math, 'random').mockReturnValue(0.999);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('refills a filtered Mix from the residual chart without exhausting it', async () => {
    const world = filteredWorld({ Sade: titles('Sade', 50) }, (index) =>
      index < 5
        ? { releaseDate: '2023-01-01', releaseDatePrecision: 'day' }
        : { releaseDate: '2015-01-01', releaseDatePrecision: 'day' },
    );

    const playlist = await world.artistMix.execute({
      kind: 'artist_mix',
      artistIds: ['sade'],
      artists: [artistSnapshot('Sade')],
      tracksPerSeed: 5,
      popularity: PopularityMode.BALANCED,
      filters: FILTERS,
    });

    expect(playlist.tracks).toHaveLength(5);
    expect(world.catalog.searchTracks).toHaveBeenCalledWith(
      'artist:"Sade" year:2020-2026',
      { limit: 10, offset: 0 },
    );
    expect(world.resolveTrack.mock.calls.length).toBeLessThanOrEqual(
      seedResolveAttemptLimit(5),
    );
  });
});

function selectionHarness() {
  const artistMix = {
    execute: jest
      .fn<Promise<{ kept: true }>, [unknown, { workPolicy?: string }?]>()
      .mockResolvedValue({ kept: true }),
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
  const discover = new GenerateDiscoverPlaylistUseCase(
    artistMix as unknown as GenerateArtistMixUseCase,
    discovery as unknown as DiscoveryCatalogPort,
    { forMarket: () => catalog as unknown as CatalogProviderPort },
    { assertAvailable: jest.fn() },
  );
  const playlists = new GeneratePlaylistUseCase(
    artistMix as unknown as GenerateArtistMixUseCase,
    { execute: jest.fn() } as unknown as GenerateGenreMixUseCase,
    discover,
  );
  return { artistMix, discover, playlists };
}

function filteredWorld(
  artistCharts: Record<string, string[]>,
  releaseOf: (index: number, artistName: string) => TrackRelease,
  searchTracks?: Record<string, string[]>,
) {
  const releases: Record<string, TrackRelease> = {};
  for (const [artistName, chart] of Object.entries(artistCharts)) {
    chart.forEach((title, index) => {
      releases[title] = releaseOf(index, artistName);
    });
  }
  return createWorld({ artistCharts, searchTracks, releases });
}

function countResolvesByArtist(
  calls: ReadonlyArray<readonly unknown[]>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [artistName] of calls) {
    const name = String(artistName);
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}
