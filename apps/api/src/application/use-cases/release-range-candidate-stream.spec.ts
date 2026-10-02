import { PopularityMode, type SelectionFilters } from '@blendify/contracts';
import { seedResolveAttemptLimit } from '@/domain/genre/catalog-resolve';
import { Track } from '@/domain/track/track.entity';
import { ArtistId } from '@/domain/value-objects/artist-id.vo';
import { TrackId } from '@/domain/value-objects/track-id.vo';
import { planCoverageFirstBoundedWork } from './artist-mix-work-policy';
import {
  artistSnapshot,
  createWorld,
  makeTrack,
  numbered,
  slug,
  titles,
  type TrackRelease,
} from './generation-world.testing';

const DECADE = { fromYear: 2020, toYear: 2026 } as const;
const INACTIVE: SelectionFilters = {
  region: null,
  femaleVocals: false,
  releaseRange: null,
  excludeLive: false,
};
const YEAR_QUERY = /year:2020-2026/;

function released(year: number, albumName?: string): TrackRelease {
  return {
    releaseDate: `${year}-01-01`,
    releaseDatePrecision: 'day',
    albumName,
  };
}

function datedTrack(
  artistName: string,
  title: string,
  id: string,
  year: number,
  albumName?: string,
): Track {
  return Track.create({
    id: TrackId.create(id),
    name: title,
    artistId: ArtistId.create(slug(artistName)),
    artistName,
    durationMs: 200_000,
    popularity: null,
    uri: `spotify:track:${id}`,
    albumName,
    releaseDate: `${year}-01-01`,
    releaseDatePrecision: 'day',
  });
}

function chartOf(artistName: string, count: number, year: number) {
  const chart = titles(artistName, count);
  const releases = Object.fromEntries(
    chart.map((title) => [title, released(year)]),
  );
  return { chart, releases };
}

describe('release-range candidate stream', () => {
  beforeEach(() => {
    jest.spyOn(Math, 'random').mockReturnValue(0.999);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Artist Mix', () => {
    const artist = 'Arctic Monkeys';

    function mix(
      world: ReturnType<typeof createWorld>,
      tracksPerSeed: number,
      popularity: (typeof PopularityMode)[keyof typeof PopularityMode] = PopularityMode.BALANCED,
      filters: Partial<SelectionFilters> = {},
    ) {
      return world.artistMix.execute({
        kind: 'artist_mix',
        artistIds: [slug(artist)],
        artists: [artistSnapshot(artist)],
        tracksPerSeed,
        maxTracks: tracksPerSeed,
        popularity,
        orderMode: 'random',
        filters: { ...INACTIVE, ...filters },
      });
    }

    it('A: fills from the year-aware search and does not resolve the pre-2020 chart', async () => {
      const { chart, releases } = chartOf(artist, 50, 2013);
      const world = createWorld({
        artistCharts: { [artist]: chart },
        releases,
      });
      const calls: string[] = [];
      world.catalog.searchTracks.mockImplementation((query: string) => {
        calls.push(`search:${query}`);
        if (!YEAR_QUERY.test(String(query))) {
          return Promise.resolve([]);
        }
        return Promise.resolve([
          datedTrack(artist, 'Mirrorball', 'mirrorball', 2022),
          datedTrack(artist, 'Body Paint', 'body-single', 2022, 'Body Paint'),
          datedTrack(artist, 'Body Paint', 'body-album', 2022, 'The Car'),
          datedTrack(artist, 'Sculptures', 'sculptures', 2022, 'The Car'),
          datedTrack(artist, 'Opening Night', 'opening', 2026),
          datedTrack(artist, 'Old Live', 'old-live', 2022, 'Live at the Arena'),
          datedTrack(artist, 'Too Early', 'too-early', 2019),
          makeTrack('Other Act', 'Homonym', released(2022)),
        ]);
      });
      world.resolveTrack.mockImplementation(
        (artistName: string, title: string) => {
          calls.push(`resolve:${title}`);
          return Promise.resolve(makeTrack(artistName, title, releases[title]));
        },
      );

      const playlist = await mix(world, 4, PopularityMode.RARITIES, {
        releaseRange: DECADE,
        excludeLive: true,
      });

      expect(calls[0]).toMatch(
        /^search:artist:"Arctic Monkeys" year:2020-2026$/,
      );
      expect(calls.some((call) => call.startsWith('resolve:'))).toBe(false);
      expect(playlist.tracks.map((track) => track.name).sort()).toEqual([
        'Body Paint',
        'Mirrorball',
        'Opening Night',
        'Sculptures',
      ]);
      expect(
        playlist.tracks.filter((track) => track.name === 'Body Paint'),
      ).toHaveLength(1);
      expect(
        playlist.tracks.every(
          (track) =>
            track.releaseDate !== undefined &&
            Number(track.releaseDate.slice(0, 4)) >= 2020 &&
            Number(track.releaseDate.slice(0, 4)) <= 2026 &&
            track.albumName !== 'Live at the Arena',
        ),
      ).toBe(true);
    });

    it('B: keeps one year-aware search and a capped residual chart when the search is short', async () => {
      const { chart, releases } = chartOf(artist, 50, 2013);
      releases[chart[0]] = released(2022);
      releases[chart[1]] = released(2024);
      const world = createWorld({
        artistCharts: { [artist]: chart },
        releases,
      });
      world.catalog.searchTracks.mockImplementation((query: string) => {
        if (!YEAR_QUERY.test(String(query))) {
          return Promise.resolve([]);
        }
        return Promise.resolve([
          datedTrack(artist, 'Search One', 'search-one', 2022),
          datedTrack(artist, 'Search Two', 'search-two', 2023),
        ]);
      });

      const playlist = await mix(world, 4, PopularityMode.RARITIES, {
        releaseRange: DECADE,
      });

      expect(world.catalog.searchTracks).toHaveBeenCalledTimes(1);
      expect(world.catalog.searchTracks).toHaveBeenCalledWith(
        'artist:"Arctic Monkeys" year:2020-2026',
        { limit: 10, offset: 0 },
      );
      expect(world.resolveTrack.mock.calls.length).toBeGreaterThan(0);
      expect(world.resolveTrack.mock.calls.length).toBeLessThanOrEqual(
        seedResolveAttemptLimit(4),
      );
      expect(world.resolveTrack.mock.calls.length).toBeLessThan(chart.length);
      expect(playlist.tracks.map((track) => track.name).sort()).toEqual(
        [chart[0], chart[1], 'Search One', 'Search Two'].sort(),
      );
    });

    it('C: still reports NO_TRACKS_FOUND when the year-aware search and the capped chart are empty', async () => {
      const { chart, releases } = chartOf(artist, 50, 2013);
      const world = createWorld({
        artistCharts: { [artist]: chart },
        releases,
      });
      world.catalog.searchTracks.mockResolvedValue([]);

      await expect(
        mix(world, 4, PopularityMode.BALANCED, { releaseRange: DECADE }),
      ).rejects.toMatchObject({ code: 'NO_TRACKS_FOUND' });
      expect(world.catalog.searchTracks).toHaveBeenCalledTimes(1);
      expect(world.resolveTrack.mock.calls.length).toBeGreaterThan(0);
      expect(world.resolveTrack.mock.calls.length).toBeLessThanOrEqual(
        seedResolveAttemptLimit(4),
      );
      expect(world.resolveTrack).not.toHaveBeenCalledTimes(chart.length);
    });
  });

  describe('Discover Artist', () => {
    const peers = numbered('Peer', 10);

    function discover(
      world: ReturnType<typeof createWorld>,
      popularity: (typeof PopularityMode)[keyof typeof PopularityMode],
      filters: Partial<SelectionFilters> = {},
    ) {
      return world.discover.execute({
        kind: 'discover_artist',
        artistId: 'seed',
        artist: { id: 'seed', name: 'Seed' },
        targetTrackCount: 10,
        popularity,
        orderMode: 'random',
        filters: { ...INACTIVE, ...filters },
      });
    }

    function peerWorld(years: (artistName: string, index: number) => number) {
      const artistCharts: Record<string, string[]> = {};
      const releases: Record<string, TrackRelease> = {};
      for (const name of peers) {
        const chart = titles(name, 50);
        artistCharts[name] = chart;
        chart.forEach((title, index) => {
          releases[title] = released(years(name, index));
        });
      }
      return createWorld({
        similarArtists: peers,
        artistCharts,
        releases,
      });
    }

    it('D: completes from year-aware searches without chart resolves', async () => {
      const world = peerWorld(() => 2012);
      const plan = planCoverageFirstBoundedWork({
        totalNeeded: 10,
        sourceCount: 10,
      });
      world.catalog.searchTracks.mockImplementation((query: string) => {
        const artistName = /artist:"([^"]*)"/.exec(String(query))?.[1] ?? '';
        if (!YEAR_QUERY.test(String(query))) {
          return Promise.resolve([]);
        }
        return Promise.resolve([
          datedTrack(
            artistName,
            `${artistName} Year Hit`,
            `${slug(artistName)}-year`,
            2023,
          ),
        ]);
      });

      const playlist = await discover(world, PopularityMode.RARITIES, {
        releaseRange: DECADE,
        excludeLive: true,
      });

      expect(playlist.tracks).toHaveLength(10);
      expect(world.resolveTrack).not.toHaveBeenCalled();
      expect(world.catalog.searchTracks.mock.calls.length).toBeLessThanOrEqual(
        plan.maxFallbackSearches,
      );
      expect(world.catalog.searchTracks.mock.calls.length).toBe(peers.length);
      expect(
        world.catalog.searchTracks.mock.calls.every(([query]) =>
          YEAR_QUERY.test(String(query)),
        ),
      ).toBe(true);
      expect(plan).toMatchObject({
        coverageResolveBudget: 30,
        redistributionResolveBudget: 30,
        maxFallbackSearches: 10,
      });
    });

    it('E: uses one year-aware search per source, then bounded residual coverage', async () => {
      const yearPeers = new Set(peers.slice(0, 5));
      const world = peerWorld((name, index) =>
        !yearPeers.has(name) && index === 0 ? 2023 : 2012,
      );
      const plan = planCoverageFirstBoundedWork({
        totalNeeded: 10,
        sourceCount: 10,
      });
      world.catalog.searchTracks.mockImplementation((query: string) => {
        const artistName = /artist:"([^"]*)"/.exec(String(query))?.[1] ?? '';
        if (!YEAR_QUERY.test(String(query)) || !yearPeers.has(artistName)) {
          return Promise.resolve([]);
        }
        return Promise.resolve([
          datedTrack(
            artistName,
            `${artistName} Year Only`,
            `${slug(artistName)}-year`,
            2022,
          ),
        ]);
      });

      const playlist = await discover(world, PopularityMode.BALANCED, {
        releaseRange: DECADE,
      });
      const searchesByArtist = new Map<string, number>();
      for (const [query] of world.catalog.searchTracks.mock.calls) {
        const artistName = /artist:"([^"]*)"/.exec(String(query))?.[1] ?? '';
        searchesByArtist.set(
          artistName,
          (searchesByArtist.get(artistName) ?? 0) + 1,
        );
      }

      expect(playlist.tracks).toHaveLength(10);
      expect(
        playlist.tracks.filter((track) => track.name.endsWith('Year Only')),
      ).toHaveLength(5);
      expect(world.catalog.searchTracks.mock.calls.length).toBeLessThanOrEqual(
        plan.maxFallbackSearches,
      );
      expect([...searchesByArtist.values()].every((count) => count === 1)).toBe(
        true,
      );
      expect(world.resolveTrack.mock.calls.length).toBeGreaterThan(0);
      expect(world.resolveTrack.mock.calls.length).toBeLessThanOrEqual(
        plan.maxTrackResolutions,
      );
    });

    it('F: does not spend the resolve budget on the rarities tail before the year-aware search', async () => {
      const world = peerWorld((_name, index) => (index === 0 ? 2023 : 2012));
      const calls: string[] = [];
      world.catalog.searchTracks.mockImplementation((query: string) => {
        calls.push(`search:${query}`);
        return Promise.resolve([]);
      });
      const resolveTrack = world.resolveTrack.getMockImplementation();
      world.resolveTrack.mockImplementation(async (artistName, title) => {
        calls.push(`resolve:${title}`);
        return resolveTrack ? resolveTrack(artistName, title) : null;
      });

      const playlist = await discover(world, PopularityMode.RARITIES, {
        releaseRange: DECADE,
      });
      const firstResolve = calls.find((call) => call.startsWith('resolve:'));

      expect(calls[0]).toMatch(YEAR_QUERY);
      expect(playlist.tracks).toHaveLength(10);
      expect(firstResolve).toBe('resolve:Peer 1 Song 1');
      expect(calls.some((call) => call === 'resolve:Peer 1 Song 31')).toBe(
        false,
      );
    });
  });

  describe('Arctic Monkeys-like regression', () => {
    it('returns the year-aware page instead of zero tracks from a 2006–2013 chart', async () => {
      const artist = 'Arctic Monkeys';
      const { chart, releases } = chartOf(artist, 50, 2011);
      const world = createWorld({
        artistCharts: { [artist]: chart },
        releases,
      });
      const calls: string[] = [];
      world.catalog.searchTracks.mockImplementation((query: string) => {
        calls.push(String(query));
        if (!YEAR_QUERY.test(String(query))) {
          return Promise.resolve([]);
        }
        return Promise.resolve([
          datedTrack(artist, 'Body Paint', 'body-single', 2022, 'Body Paint'),
          datedTrack(artist, 'Mirrorball', 'mirrorball', 2022),
          datedTrack(artist, 'Body Paint', 'body-album', 2022, 'The Car'),
          datedTrack(artist, 'Opening Night', 'opening', 2026),
          datedTrack(artist, 'Sculptures', 'sculptures', 2022, 'The Car'),
        ]);
      });
      world.resolveTrack.mockImplementation(() => {
        calls.push('resolve');
        return Promise.resolve(null);
      });

      const playlist = await world.artistMix.execute({
        kind: 'artist_mix',
        artistIds: [slug(artist)],
        artists: [artistSnapshot(artist)],
        tracksPerSeed: 10,
        maxTracks: 10,
        popularity: PopularityMode.RARITIES,
        orderMode: 'random',
        filters: { ...INACTIVE, releaseRange: DECADE, excludeLive: true },
      });

      expect(calls[0]).toBe('artist:"Arctic Monkeys" year:2020-2026');
      expect(calls.indexOf('resolve')).toBeGreaterThan(0);
      expect(playlist.tracks).toHaveLength(4);
      expect(
        playlist.tracks.filter((track) => track.name === 'Body Paint'),
      ).toHaveLength(1);
      expect(
        playlist.tracks.every((track) => {
          const year = Number(track.releaseDate?.slice(0, 4));
          return year >= 2020 && year <= 2026;
        }),
      ).toBe(true);
      expect(world.resolveTrack.mock.calls.length).toBeLessThan(chart.length);
    });
  });
});
