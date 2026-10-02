import { PopularityMode, type SelectionFilters } from '@blendify/contracts';
import { seedResolveAttemptLimit } from '@/domain/genre/catalog-resolve';
import type {
  ArtistTagCandidate,
  SimilarTrackCandidate,
} from '@/domain/repositories/discovery-catalog.port';
import type { Track } from '@/domain/track/track.entity';
import type { TrackRelease } from './generation-world.testing';
import {
  artistSnapshot,
  createWorld,
  makeTrack,
  numbered,
  titles,
} from './generation-world.testing';

const INACTIVE: SelectionFilters = {
  region: null,
  femaleVocals: false,
  releaseRange: null,
  excludeLive: false,
};

function releasedIn(
  years: Record<string, number>,
  albumName?: string,
): Record<string, TrackRelease> {
  return Object.fromEntries(
    Object.entries(years).map(([title, year]) => [
      title,
      { releaseDate: `${year}-01-01`, releaseDatePrecision: 'day', albumName },
    ]),
  );
}

const NINETIES = { fromYear: 1990, toYear: 1999 };
const FEMALE_VOCALS: ArtistTagCandidate = {
  name: 'female vocalists',
  count: 60,
};
const ARGENTINA: ArtistTagCandidate = { name: 'argentina', count: 70 };
const ROCK: ArtistTagCandidate = { name: 'rock', count: 100 };

function tagsFor(
  names: readonly string[],
  tags: (name: string) => ArtistTagCandidate[],
): Record<string, ArtistTagCandidate[]> {
  return Object.fromEntries(names.map((name) => [name, tags(name)]));
}

function hasVocalTag(name: string): boolean {
  return name.includes('Voice');
}

function yearsOf(
  titlesByYear: Array<[string[], number]>,
): Record<string, number> {
  return Object.fromEntries(
    titlesByYear.flatMap(([list, year]) => list.map((title) => [title, year])),
  );
}

const ARTIST_FETCH_BUDGET = 13;

describe('selection filters target fulfillment', () => {
  beforeEach(() => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Artist Mix', () => {
    const chart = titles('Soda Stereo', 50);

    function sodaStereo(
      years: Record<string, number>,
      filters: Partial<SelectionFilters>,
      extra: { searchTracks?: string[]; albums?: Record<string, string> } = {},
    ) {
      const releases = releasedIn(years);
      for (const [title, albumName] of Object.entries(extra.albums ?? {})) {
        releases[title] = { ...releases[title], albumName };
      }
      const world = createWorld({
        artistCharts: { 'Soda Stereo': chart },
        searchTracks: { 'Soda Stereo': extra.searchTracks ?? [] },
        releases,
      });
      return {
        world,
        run: () =>
          world.artistMix.execute({
            kind: 'artist_mix',
            artistIds: ['soda-stereo'],
            artists: [artistSnapshot('Soda Stereo')],
            tracksPerSeed: 10,
            popularity: PopularityMode.BALANCED,
            filters: { ...INACTIVE, ...filters },
          }),
      };
    }

    it('keeps exploring the loaded chart until the decade target is met', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.999);
      const eighties = [0, 4, 8, 12, 16, 20, 22, 24, 26, 28].map(
        (index) => chart[index],
      );
      const { run } = sodaStereo(
        yearsOf([
          [chart, 2005],
          [eighties, 1986],
        ]),
        { releaseRange: { fromYear: 1980, toYear: 1989 } },
      );

      const playlist = await run();

      expect(playlist.tracks).toHaveLength(10);
      expect(playlist.tracks.map((track) => track.name).sort()).toEqual(
        [...eighties].sort(),
      );
    });

    it('replaces live versions with deeper studio versions', async () => {
      const live = chart.slice(0, 8);
      const world = createWorld({
        artistCharts: {
          'Soda Stereo': [
            ...live.map((title) => `${title} - En Vivo`),
            ...chart.slice(8, 30),
          ],
        },
      });

      const playlist = await world.artistMix.execute({
        kind: 'artist_mix',
        artistIds: ['soda-stereo'],
        artists: [artistSnapshot('Soda Stereo')],
        tracksPerSeed: 10,
        popularity: PopularityMode.POPULAR,
        filters: { ...INACTIVE, excludeLive: true },
      });

      expect(playlist.tracks).toHaveLength(10);
      expect(
        playlist.tracks.some((track) => track.name.endsWith('En Vivo')),
      ).toBe(false);
    });

    it('combines the decade and live filters', async () => {
      const eighties = chart.slice(0, 20);
      const liveAlbum = Object.fromEntries(
        chart.slice(0, 12).map((title) => [title, 'Gira Animal (En Vivo)']),
      );
      const { run } = sodaStereo(
        yearsOf([
          [chart, 1995],
          [eighties, 1985],
        ]),
        {
          releaseRange: { fromYear: 1980, toYear: 1989 },
          excludeLive: true,
        },
        { albums: liveAlbum },
      );

      const playlist = await run();

      expect(playlist.tracks.map((track) => track.name).sort()).toEqual(
        chart.slice(12, 20).sort(),
      );
      expect(playlist.generation).toMatchObject({
        kind: 'artist_mix',
        filters: {
          releaseRange: { fromYear: 1980, toYear: 1989 },
          excludeLive: true,
        },
      });
    });

    it('reports matching progress only for accepted tracks', async () => {
      const world = createWorld({
        artistCharts: { 'Soda Stereo': chart },
        releases: releasedIn(
          yearsOf([
            [chart, 2005],
            [chart.slice(40, 44), 1986],
          ]),
        ),
      });
      const matched: number[] = [];

      const playlist = await world.artistMix.execute(
        {
          kind: 'artist_mix',
          artistIds: ['soda-stereo'],
          artists: [artistSnapshot('Soda Stereo')],
          tracksPerSeed: 10,
          popularity: PopularityMode.BALANCED,
          filters: { ...INACTIVE, releaseRange: { toYear: 1989 } },
        },
        {
          onProgress: (progress) => {
            if (progress.phase === 'matching_tracks') {
              matched.push(progress.current);
            }
          },
        },
      );

      expect(playlist.tracks).toHaveLength(4);
      expect(Math.max(...matched)).toBe(4);
    });

    it('returns the genuine shortfall without relaxing the decade', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.999);
      const { run, world } = sodaStereo(
        yearsOf([
          [chart, 2005],
          [chart.slice(0, 4), 1987],
        ]),
        { releaseRange: { fromYear: 1980, toYear: 1989 } },
        { searchTracks: ['Search Hit'] },
      );

      const playlist = await run();

      expect(playlist.tracks).toHaveLength(4);
      expect(world.resolveTrack.mock.calls.length).toBeLessThanOrEqual(
        seedResolveAttemptLimit(10),
      );
      expect(world.resolveTrack.mock.calls.length).toBeLessThan(chart.length);
      expect(world.catalog.searchTracks).toHaveBeenCalledWith(
        'artist:"Soda Stereo" year:1980-1989',
        { limit: 10, offset: 0 },
      );
      expect(
        playlist.tracks.every((track) => track.releaseDate === '1987-01-01'),
      ).toBe(true);
    });

    it('stops resolving chart entries once the decade target is fulfilled', async () => {
      const eighties = chart.filter((_, index) => index % 2 === 0);
      const { run, world } = sodaStereo(
        yearsOf([
          [chart, 2005],
          [eighties, 1986],
        ]),
        { releaseRange: { fromYear: 1980, toYear: 1989 } },
        { searchTracks: ['Search Hit'] },
      );

      const playlist = await run();

      const resolved = world.resolveTrack.mock.calls.map(([, title]) => title);
      const inRange = new Set(eighties);
      expect(playlist.tracks).toHaveLength(10);
      expect(resolved.length).toBeLessThan(chart.length);
      expect(resolved.filter((title) => inRange.has(title))).toHaveLength(10);
      expect(inRange.has(resolved[resolved.length - 1])).toBe(true);
      expect(new Set(resolved).size).toBe(resolved.length);
      expect(world.catalog.searchTracks).toHaveBeenCalledWith(
        'artist:"Soda Stereo" year:1980-1989',
        { limit: 10, offset: 0 },
      );
    });

    it('stops resolving chart entries once the live filter target is fulfilled', async () => {
      const mixedChart = chart.map((title, index) =>
        index % 2 === 0 ? title : `${title} - En Vivo`,
      );
      const world = createWorld({
        artistCharts: { 'Soda Stereo': mixedChart },
        searchTracks: { 'Soda Stereo': ['Search Hit'] },
      });

      const playlist = await world.artistMix.execute({
        kind: 'artist_mix',
        artistIds: ['soda-stereo'],
        artists: [artistSnapshot('Soda Stereo')],
        tracksPerSeed: 10,
        popularity: PopularityMode.BALANCED,
        filters: { ...INACTIVE, excludeLive: true },
      });

      const resolved = world.resolveTrack.mock.calls.map(([, title]) => title);
      const studio = resolved.filter((title) => !title.endsWith('En Vivo'));
      expect(playlist.tracks).toHaveLength(10);
      expect(resolved.length).toBeLessThan(mixedChart.length);
      expect(studio).toHaveLength(ARTIST_FETCH_BUDGET);
      expect(resolved[resolved.length - 1].endsWith('En Vivo')).toBe(false);
      expect(world.catalog.searchTracks).not.toHaveBeenCalled();
    });

    it('keeps the per-artist allocation while filtering', async () => {
      const filtered = titles('Charly García', 30);
      const world = createWorld({
        artistCharts: {
          'Soda Stereo': chart,
          'Charly García': filtered,
        },
        releases: releasedIn(
          yearsOf([
            [chart, 1985],
            [filtered, 1985],
          ]),
        ),
      });

      const playlist = await world.artistMix.execute({
        kind: 'artist_mix',
        artistIds: ['soda-stereo', 'charly-garc-a'],
        artists: [
          artistSnapshot('Soda Stereo'),
          { id: 'charly-garc-a', name: 'Charly García' },
        ],
        tracksPerSeed: 5,
        popularity: PopularityMode.BALANCED,
        filters: { ...INACTIVE, releaseRange: { toYear: 1989 } },
      });

      const perArtist = new Map<string, number>();
      for (const track of playlist.tracks) {
        perArtist.set(
          track.artistName,
          (perArtist.get(track.artistName) ?? 0) + 1,
        );
      }
      expect(Object.fromEntries(perArtist)).toEqual({
        'Soda Stereo': 5,
        'Charly García': 5,
      });
    });

    it.each([{ region: 'argentina' as const }, { femaleVocals: true }])(
      'rejects the artist-level filter %p',
      async (filter) => {
        const { world } = sodaStereo({}, {});

        const pending = world.artistMix.execute({
          kind: 'artist_mix',
          artistIds: ['soda-stereo'],
          artists: [artistSnapshot('Soda Stereo')],
          tracksPerSeed: 5,
          popularity: PopularityMode.BALANCED,
          filters: { ...INACTIVE, ...filter },
        });
        // Math.random is pinned to 0 above. Jest's source-map sort calls
        // Math.random and recurses forever while formatting this rejection.
        jest.restoreAllMocks();
        await expect(pending).rejects.toThrow();
        expect(world.resolveTrack).not.toHaveBeenCalled();
      },
    );
  });

  describe('Genre Mix', () => {
    function chartOf(artists: readonly string[]) {
      return artists.map((artistName) => ({
        artistName,
        trackName: `${artistName} Hit`,
      }));
    }

    it('admits only female-vocal artists from the genre chart before resolving', async () => {
      const artists = numbered('Band', 30).map((name, index) =>
        index % 3 === 0 ? `${name} Voice` : name,
      );
      const world = createWorld({
        tagCharts: { rock: chartOf(artists) },
        artistTags: tagsFor(artists, (name) =>
          hasVocalTag(name) ? [ROCK, FEMALE_VOCALS] : [ROCK],
        ),
      });

      const playlist = await world.genreMix.execute({
        kind: 'genre_mix',
        genreIds: ['rock'],
        tracksPerSeed: 8,
        popularity: PopularityMode.BALANCED,
        filters: { ...INACTIVE, femaleVocals: true },
      });

      expect(playlist.tracks).toHaveLength(8);
      expect(
        playlist.tracks.every((track) => hasVocalTag(track.artistName)),
      ).toBe(true);
      expect(
        world.resolveTrack.mock.calls.every(([artistName]) =>
          hasVocalTag(artistName),
        ),
      ).toBe(true);
    });

    it('filters the genre chart by decade and live versions and refills deeper', async () => {
      const artists = numbered('Band', 40);
      const hits = artists.map((name) => `${name} Hit`);
      const world = createWorld({
        tagCharts: { rock: chartOf(artists) },
        releases: {
          ...releasedIn(
            yearsOf([
              [hits, 2010],
              [hits.slice(10, 30), 1994],
            ]),
          ),
          ...releasedIn(yearsOf([[hits.slice(10, 15), 1994]]), 'Unplugged'),
        },
      });

      const playlist = await world.genreMix.execute({
        kind: 'genre_mix',
        genreIds: ['rock'],
        tracksPerSeed: 10,
        popularity: PopularityMode.BALANCED,
        filters: { ...INACTIVE, releaseRange: NINETIES, excludeLive: true },
      });

      expect(playlist.tracks).toHaveLength(10);
      expect(playlist.tracks.map((track) => track.name).sort()).toEqual(
        hits.slice(15, 25).sort(),
      );
    });

    it('evaluates region, genre and female vocals from one tag lookup per artist', async () => {
      const region = numbered('Act', 40).map((name, index) =>
        index % 2 === 0 ? `${name} Voice` : name,
      );
      const world = createWorld({
        tagArtists: { argentina: region.map((name) => ({ name })) },
        artistTags: tagsFor(region, (name) =>
          hasVocalTag(name)
            ? [ROCK, ARGENTINA, FEMALE_VOCALS]
            : [ROCK, ARGENTINA],
        ),
        artistCharts: Object.fromEntries(
          region.map((name) => [name, titles(name, 3)]),
        ),
      });

      const playlist = await world.genreMix.execute({
        kind: 'genre_mix',
        genreIds: ['rock'],
        tracksPerSeed: 10,
        popularity: PopularityMode.BALANCED,
        filters: { ...INACTIVE, region: 'argentina', femaleVocals: true },
      });

      const lookups = world.discovery.getTopTagsForArtist.mock.calls.map(
        ([artist]) => artist.name,
      );
      expect(playlist.tracks).toHaveLength(10);
      expect(
        playlist.tracks.every((track) => hasVocalTag(track.artistName)),
      ).toBe(true);
      expect(new Set(lookups).size).toBe(lookups.length);
      expect(world.discovery.getTopTracksForTag).not.toHaveBeenCalled();
    });

    it('combines region with decade without leaving the region', async () => {
      const region = numbered('Act', 20);
      const songs = region.flatMap((name) => titles(name, 3));
      const world = createWorld({
        tagArtists: { argentina: region.map((name) => ({ name })) },
        artistTags: tagsFor(region, () => [ROCK, ARGENTINA]),
        artistCharts: Object.fromEntries(
          region.map((name) => [name, titles(name, 3)]),
        ),
        releases: releasedIn(
          yearsOf([
            [songs, 2012],
            [songs.filter((_, index) => index % 3 === 2), 1996],
          ]),
        ),
      });

      const playlist = await world.genreMix.execute({
        kind: 'genre_mix',
        genreIds: ['rock'],
        tracksPerSeed: 6,
        popularity: PopularityMode.BALANCED,
        filters: { ...INACTIVE, region: 'argentina', releaseRange: NINETIES },
      });

      expect(playlist.tracks).toHaveLength(6);
      expect(
        playlist.tracks.every((track) => track.releaseDate === '1996-01-01'),
      ).toBe(true);
      expect(world.discovery.getTopTracksForTag).not.toHaveBeenCalled();
    });

    it('applies every filter together and returns the genuine shortfall', async () => {
      const region = numbered('Act', 12).map((name, index) =>
        index < 4 ? `${name} Voice` : name,
      );
      const songs = region.flatMap((name) => titles(name, 2));
      const world = createWorld({
        tagArtists: { argentina: region.map((name) => ({ name })) },
        artistTags: tagsFor(region, (name) =>
          hasVocalTag(name)
            ? [ROCK, ARGENTINA, FEMALE_VOCALS]
            : [ROCK, ARGENTINA],
        ),
        artistCharts: Object.fromEntries(
          region.map((name) => [name, titles(name, 2)]),
        ),
        releases: releasedIn(yearsOf([[songs, 1993]])),
      });
      const live = new Set(titles('Act 1 Voice', 2));
      world.resolveTrack.mockImplementation((artistName, title) =>
        Promise.resolve(
          makeTrack(artistName, live.has(title) ? `${title} (Live)` : title, {
            releaseDate: '1993',
            releaseDatePrecision: 'year',
          }),
        ),
      );

      const playlist = await world.genreMix.execute({
        kind: 'genre_mix',
        genreIds: ['rock'],
        tracksPerSeed: 10,
        popularity: PopularityMode.BALANCED,
        filters: {
          region: 'argentina',
          femaleVocals: true,
          releaseRange: NINETIES,
          excludeLive: true,
        },
      });

      expect(playlist.tracks).toHaveLength(6);
      expect(
        playlist.tracks.every(
          (track) =>
            hasVocalTag(track.artistName) && !track.name.includes('Live'),
        ),
      ).toBe(true);
    });

    it('refills cross-genre duplicates while female vocals is active', async () => {
      const shared = ['Shared 1 Voice', 'Shared 2 Voice'];
      const rock = [
        ...shared,
        ...numbered('Rocker', 8).map((n) => `${n} Voice`),
      ];
      const pop = [
        ...shared,
        ...numbered('Popper', 8).map((n) => `${n} Voice`),
      ];
      const world = createWorld({
        tagCharts: { rock: chartOf(rock), pop: chartOf(pop) },
        artistTags: tagsFor([...rock, ...pop], () => [FEMALE_VOCALS]),
      });
      jest.spyOn(Math, 'random').mockReturnValue(0.999);

      const playlist = await world.genreMix.execute({
        kind: 'genre_mix',
        genreIds: ['rock', 'pop'],
        tracksPerSeed: 5,
        popularity: PopularityMode.POPULAR,
        filters: { ...INACTIVE, femaleVocals: true },
      });

      expect(playlist.tracks).toHaveLength(10);
      expect(
        new Set(playlist.tracks.map((track) => track.id.getValue())).size,
      ).toBe(10);
    });

    it('fails as unavailable instead of dropping female vocals when every lookup fails', async () => {
      const artists = numbered('Band', 10);
      const world = createWorld({
        tagCharts: { rock: chartOf(artists) },
        failingTagLookups: new Set(artists),
      });

      await expect(
        world.genreMix.execute({
          kind: 'genre_mix',
          genreIds: ['rock'],
          tracksPerSeed: 5,
          popularity: PopularityMode.BALANCED,
          filters: { ...INACTIVE, femaleVocals: true },
        }),
      ).rejects.toMatchObject({ code: 'ARTIST_FILTER_LOOKUP_UNAVAILABLE' });
      expect(world.resolveTrack).not.toHaveBeenCalled();
    });
  });

  describe('Discover Artist', () => {
    function discoverArtist(
      world: ReturnType<typeof createWorld>,
      targetTrackCount: number,
      filters: Partial<SelectionFilters>,
    ) {
      return world.discover.execute({
        kind: 'discover_artist',
        artistId: 'sade',
        artist: { id: 'sade', name: 'Sade' },
        targetTrackCount,
        popularity: PopularityMode.POPULAR,
        orderMode: 'random',
        filters: { ...INACTIVE, ...filters },
      });
    }

    it('applies female vocals to similar artists, never to the seed', async () => {
      const similar = [
        'Near Band',
        'Near Voice 1',
        'Mid Band',
        'Near Voice 2',
        'Far Voice 3',
      ];
      const world = createWorld({
        similarArtists: similar,
        artistTags: tagsFor(similar, (name) =>
          hasVocalTag(name) ? [FEMALE_VOCALS] : [ROCK],
        ),
        artistCharts: Object.fromEntries(
          similar.map((name) => [name, titles(name, 6)]),
        ),
      });

      const playlist = await discoverArtist(world, 9, { femaleVocals: true });

      const lookups = world.discovery.getTopTagsForArtist.mock.calls.map(
        ([artist]) => artist.name,
      );
      expect(playlist.tracks).toHaveLength(9);
      expect(
        playlist.tracks.every((track) => hasVocalTag(track.artistName)),
      ).toBe(true);
      expect(lookups).not.toContain('Sade');
      expect(
        world.catalog.searchArtists.mock.calls.map(([name]) => name),
      ).toEqual(['Near Voice 1', 'Near Voice 2', 'Far Voice 3']);
    });

    it('requires region and female vocals together', async () => {
      const similar = ['Arg Band', 'Arg Voice 1', 'Non Voice', 'Arg Voice 2'];
      const world = createWorld({
        similarArtists: similar,
        artistTags: tagsFor(similar, (name) => [
          ...(name.startsWith('Arg') ? [ARGENTINA] : []),
          ...(hasVocalTag(name) ? [FEMALE_VOCALS] : []),
        ]),
        artistCharts: Object.fromEntries(
          similar.map((name) => [name, titles(name, 6)]),
        ),
      });

      const playlist = await discoverArtist(world, 8, {
        region: 'argentina',
        femaleVocals: true,
      });

      expect(new Set(playlist.tracks.map((track) => track.artistName))).toEqual(
        new Set(['Arg Voice 1', 'Arg Voice 2']),
      );
      expect(playlist.generation).toMatchObject({
        kind: 'discover_artist',
        filters: { region: 'argentina', femaleVocals: true },
      });
    });

    it('applies decade and live filters to the discovered tracks and refills deeper', async () => {
      const similar = ['Near 1', 'Near 2', 'Near 3'];
      const songs = similar.flatMap((name) => titles(name, 12));
      const world = createWorld({
        similarArtists: similar,
        artistCharts: Object.fromEntries(
          similar.map((name) => [name, titles(name, 12)]),
        ),
        releases: {
          ...releasedIn(
            yearsOf([
              [songs, 2015],
              [songs.filter((_, index) => index % 12 >= 4), 1998],
            ]),
          ),
          ...releasedIn(
            yearsOf([[songs.filter((_, index) => index % 12 === 4), 1998]]),
            'Live at the Roxy',
          ),
        },
      });

      const playlist = await discoverArtist(world, 15, {
        releaseRange: NINETIES,
        excludeLive: true,
      });

      expect(playlist.tracks).toHaveLength(15);
      expect(
        playlist.tracks.every(
          (track) =>
            track.releaseDate === '1998-01-01' &&
            track.albumName !== 'Live at the Roxy',
        ),
      ).toBe(true);
      expect(playlist.generation).toMatchObject({
        filters: { releaseRange: NINETIES, excludeLive: true },
      });
    });

    it('keeps the similarity order of qualifying artists', async () => {
      const similar = ['First Voice', 'Second', 'Third Voice', 'Fourth Voice'];
      const world = createWorld({
        similarArtists: similar,
        artistTags: tagsFor(similar, (name) =>
          hasVocalTag(name) ? [FEMALE_VOCALS] : [],
        ),
        artistCharts: Object.fromEntries(
          similar.map((name) => [name, titles(name, 5)]),
        ),
      });

      await discoverArtist(world, 6, { femaleVocals: true });

      expect(
        world.catalog.searchArtists.mock.calls.map(([name]) => name),
      ).toEqual(['First Voice', 'Third Voice', 'Fourth Voice']);
    });

    it('fails instead of relaxing female vocals when too few artists qualify', async () => {
      const similar = ['Only Voice', 'Band 1', 'Band 2', 'Band 3'];
      const world = createWorld({
        similarArtists: similar,
        artistTags: tagsFor(similar, (name) =>
          hasVocalTag(name) ? [FEMALE_VOCALS] : [ROCK],
        ),
        artistCharts: Object.fromEntries(
          similar.map((name) => [name, titles(name, 5)]),
        ),
      });

      await expect(
        discoverArtist(world, 10, { femaleVocals: true }),
      ).rejects.toMatchObject({ code: 'DISCOVER_RESOLVE_FAILED' });
      expect(world.resolveTrack).not.toHaveBeenCalled();
    });
  });

  describe('Discover Track', () => {
    const SEED = makeTrack('Sade', 'Smooth Operator');

    function discoverTrack(
      world: ReturnType<typeof createWorld>,
      targetTrackCount: number,
      filters: Partial<SelectionFilters>,
    ) {
      world.catalog.searchTracks.mockResolvedValue([SEED]);
      return world.discover.execute({
        kind: 'discover_track',
        trackId: SEED.id.getValue(),
        track: {
          id: SEED.id.getValue(),
          name: SEED.name,
          artistId: SEED.artistId.getValue(),
          artistName: SEED.artistName,
        },
        targetTrackCount,
        popularity: PopularityMode.POPULAR,
        orderMode: 'random',
        filters: { ...INACTIVE, ...filters },
      });
    }

    function candidates(artists: string[]): SimilarTrackCandidate[] {
      return artists.map((artistName, index) => ({
        name: `${artistName} Tune`,
        artistName,
        playcount: 100_000 - index,
      }));
    }

    function names(tracks: readonly Track[]): string[] {
      return tracks.map((track) => track.artistName);
    }

    it('applies female vocals to the result artists, never the seed', async () => {
      const artists = numbered('Act', 40).map((name, index) =>
        index % 2 === 0 ? `${name} Voice` : name,
      );
      const world = createWorld({
        similarTracks: candidates(artists),
        artistTags: tagsFor(artists, (name) =>
          hasVocalTag(name) ? [FEMALE_VOCALS] : [],
        ),
      });

      const playlist = await discoverTrack(world, 10, { femaleVocals: true });

      const lookups = world.discovery.getTopTagsForArtist.mock.calls.map(
        ([artist]) => artist.name,
      );
      expect(playlist.tracks).toHaveLength(10);
      expect(names(playlist.tracks).every(hasVocalTag)).toBe(true);
      expect(lookups).not.toContain('Sade');
    });

    it('requires region and female vocals and keeps the primary-artist rule', async () => {
      const world = createWorld({
        similarTracks: candidates([
          'Arg Voice feat. Guest',
          'Arg Band',
          'Non Voice',
          'Arg Voice 2',
          'Arg Voice 3',
        ]),
        artistTags: {
          'Arg Voice': [ARGENTINA, FEMALE_VOCALS],
          'Arg Band': [ARGENTINA],
          'Non Voice': [FEMALE_VOCALS],
          'Arg Voice 2': [ARGENTINA, FEMALE_VOCALS],
          'Arg Voice 3': [ARGENTINA, FEMALE_VOCALS],
        },
      });

      const playlist = await discoverTrack(world, 3, {
        region: 'argentina',
        femaleVocals: true,
      });

      expect(names(playlist.tracks).sort()).toEqual(
        ['Arg Voice feat. Guest', 'Arg Voice 2', 'Arg Voice 3'].sort(),
      );
      expect(
        world.discovery.getTopTagsForArtist.mock.calls.map(
          ([artist]) => artist.name,
        ),
      ).toContain('Arg Voice');
    });

    it('rejects out-of-range and live results and refills from later candidates', async () => {
      const artists = numbered('Act', 30);
      const tunes = artists.map((name) => `${name} Tune`);
      const world = createWorld({
        similarTracks: candidates(artists),
        releases: {
          ...releasedIn(
            yearsOf([
              [tunes, 2011],
              [tunes.slice(5, 25), 1991],
            ]),
          ),
          ...releasedIn(yearsOf([[tunes.slice(5, 9), 1991]]), 'MTV Unplugged'),
        },
      });

      const playlist = await discoverTrack(world, 10, {
        releaseRange: NINETIES,
        excludeLive: true,
      });

      expect(playlist.tracks).toHaveLength(10);
      expect(
        playlist.tracks.every(
          (track) =>
            track.releaseDate === '1991-01-01' &&
            track.albumName !== 'MTV Unplugged',
        ),
      ).toBe(true);
    });

    it('applies the filters to similar-artist fallback candidates', async () => {
      const world = createWorld({
        similarTracks: candidates(['Act 1 Voice', 'Act 2', 'Act 3 Voice']),
        similarArtists: ['Fallback', 'Fallback Voice'],
        artistTags: {
          'Act 1 Voice': [FEMALE_VOCALS],
          'Act 3 Voice': [FEMALE_VOCALS],
          'Fallback Voice': [FEMALE_VOCALS],
        },
        artistCharts: {
          Fallback: titles('Fallback', 8),
          'Fallback Voice': titles('Fallback Voice', 8),
        },
      });

      const playlist = await discoverTrack(world, 6, { femaleVocals: true });

      expect(names(playlist.tracks).every(hasVocalTag)).toBe(true);
      expect(names(playlist.tracks)).toContain('Fallback Voice');
    });

    it('returns the genuine shortfall without relaxing the decade', async () => {
      const artists = numbered('Act', 30);
      const tunes = artists.map((name) => `${name} Tune`);
      const world = createWorld({
        similarTracks: candidates(artists),
        releases: releasedIn(
          yearsOf([
            [tunes, 2011],
            [tunes.slice(0, 4), 1991],
          ]),
        ),
      });

      const playlist = await discoverTrack(world, 10, {
        releaseRange: NINETIES,
      });

      expect(playlist.tracks).toHaveLength(4);
      expect(
        playlist.tracks.every((track) => track.releaseDate === '1991-01-01'),
      ).toBe(true);
    });
  });
});
