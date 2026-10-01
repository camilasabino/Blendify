import { PopularityMode, type MusicRegion } from '@blendify/contracts';
import { Artist } from '@/domain/artist/artist.entity';
import type { CatalogProviderPort } from '@/domain/repositories/catalog-provider.port';
import type {
  ArtistTagCandidate,
  CatalogTrackCandidate,
  DiscoveryArtistIdentity,
  DiscoveryCatalogPort,
  SimilarArtistCandidate,
  SimilarTrackCandidate,
} from '@/domain/repositories/discovery-catalog.port';
import { Track } from '@/domain/track/track.entity';
import { ArtistId } from '@/domain/value-objects/artist-id.vo';
import { TrackId } from '@/domain/value-objects/track-id.vo';
import { GenreTrackCatalogService } from '@/application/services/genre-track-catalog.service';
import { GenerateArtistMixUseCase } from './generate-artist-mix.use-case';
import { GenerateDiscoverPlaylistUseCase } from './generate-discover-playlist.use-case';
import { GenerateGenreMixUseCase } from './generate-genre-mix.use-case';

function slug(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
}

function makeTrack(artistName: string, title: string): Track {
  const id = `${slug(artistName)}--${slug(title)}`;
  return Track.create({
    id: TrackId.create(id),
    name: title,
    artistId: ArtistId.create(slug(artistName)),
    artistName,
    durationMs: 200_000,
    popularity: 50,
    uri: `spotify:track:${id}`,
  });
}

function titles(artistName: string, count: number, offset = 1): string[] {
  return Array.from(
    { length: count },
    (_, index) => `${artistName} Song ${index + offset}`,
  );
}

function numbered(prefix: string, count: number, offset = 1): string[] {
  return Array.from(
    { length: count },
    (_, index) => `${prefix} ${index + offset}`,
  );
}

type WorldInput = {
  artistCharts?: Record<string, string[]>;
  unresolvable?: Set<string>;
  tagCharts?: Record<string, CatalogTrackCandidate[]>;
  tagArtists?: Record<string, SimilarArtistCandidate[]>;
  artistTags?: Record<string, ArtistTagCandidate[]>;
  failingTagLookups?: Set<string>;
  similarArtists?: Array<string | SimilarArtistCandidate>;
  similarTracks?: SimilarTrackCandidate[];
  searchTracks?: Record<string, string[]>;
};

function createWorld(input: WorldInput) {
  const unresolvable = input.unresolvable ?? new Set<string>();
  const discovery = {
    isConfigured: () => true,
    getSimilarArtists: jest.fn(() =>
      Promise.resolve(
        (input.similarArtists ?? []).map((artist) =>
          typeof artist === 'string' ? { name: artist, match: 1 } : artist,
        ),
      ),
    ),
    getSimilarTracks: jest.fn(() => Promise.resolve(input.similarTracks ?? [])),
    getTopArtistsForTag: jest.fn((tag: string, limit = 50, page = 1) =>
      Promise.resolve(
        (input.tagArtists?.[tag] ?? []).slice((page - 1) * limit, page * limit),
      ),
    ),
    getTopTracksForTag: jest.fn((tag: string) =>
      Promise.resolve(input.tagCharts?.[tag] ?? []),
    ),
    getTopTracksForArtist: jest.fn(
      (artist: DiscoveryArtistIdentity, limit = 50) =>
        Promise.resolve(
          (input.artistCharts?.[artist.name] ?? [])
            .slice(0, limit)
            .map((trackName, index) => ({
              artistName: artist.name,
              trackName,
              rank: index + 1,
              playcount: 100_000 - index,
            })),
        ),
    ),
    getTopTagsForArtist: jest.fn((artist: DiscoveryArtistIdentity) =>
      input.failingTagLookups?.has(artist.name)
        ? Promise.reject(new Error('Last.fm unavailable'))
        : Promise.resolve(
            input.artistTags?.[artist.mbid ?? artist.name] ??
              input.artistTags?.[artist.name] ??
              [],
          ),
    ),
  } satisfies DiscoveryCatalogPort;
  const resolveTrack = jest.fn((artistName: string, title: string) =>
    Promise.resolve(
      unresolvable.has(title) ? null : makeTrack(artistName, title),
    ),
  );
  const catalog = {
    resolveTrack,
    searchArtists: jest.fn((name: string) =>
      Promise.resolve([
        Artist.create({ id: ArtistId.create(slug(name)), name }),
      ]),
    ),
    searchTracks: jest.fn((query: string) => {
      const artistName = /artist:"([^"]*)"/.exec(query)?.[1] ?? '';
      return Promise.resolve(
        (input.searchTracks?.[artistName] ?? []).map((title) =>
          makeTrack(artistName, title),
        ),
      );
    }),
    getArtistsByIds: jest.fn((ids: string[]) =>
      Promise.resolve(
        ids.map((id) => Artist.create({ id: ArtistId.create(id), name: id })),
      ),
    ),
  } satisfies CatalogProviderPort;
  const catalogs = { forMarket: () => catalog };
  const quota = { assertAvailable: jest.fn() };
  const artistMix = new GenerateArtistMixUseCase(catalogs, quota, discovery);
  const genreMix = new GenerateGenreMixUseCase(
    catalogs,
    new GenreTrackCatalogService(discovery, quota),
  );
  const discover = new GenerateDiscoverPlaylistUseCase(
    artistMix,
    discovery,
    catalogs,
    quota,
  );

  return { discovery, catalog, resolveTrack, artistMix, genreMix, discover };
}

function artistSnapshot(name: string) {
  return { id: slug(name), name };
}

function versionKeys(tracks: readonly Track[]): Set<string> {
  return new Set(
    tracks.map(
      (track) =>
        `${track.artistId.getValue()}::${track.name.replace(/ - .*$/, '')}`,
    ),
  );
}

describe('generation target fulfillment', () => {
  beforeEach(() => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Artist Mix', () => {
    it('refills from the chart when alternate versions collapse after deduplication', async () => {
      const world = createWorld({
        artistCharts: {
          Sade: [
            'Song 1',
            'Song 1 - Live',
            'Song 1 - Demo',
            'Song 1 - Remastered',
            'Song 2',
            'Song 2 - Live',
            'Song 2 - Demo',
            'Song 2 - Remastered',
            'Song 2 - Acoustic',
            'Song 3',
            'Song 4',
            'Song 5',
            'Song 6',
          ],
        },
      });

      const playlist = await world.artistMix.execute({
        kind: 'artist_mix',
        artistIds: ['sade'],
        artists: [artistSnapshot('Sade')],
        tracksPerSeed: 5,
        popularity: PopularityMode.BALANCED,
      });

      expect(playlist.tracks).toHaveLength(5);
      expect(versionKeys(playlist.tracks).size).toBe(5);
    });

    it('tops up the total target from an artist with surplus when another seed runs dry', async () => {
      const world = createWorld({
        artistCharts: { Interpol: titles('Interpol', 20) },
      });

      const playlist = await world.artistMix.execute({
        kind: 'artist_mix',
        artistIds: ['radiohead', 'interpol'],
        artists: [artistSnapshot('Radiohead'), artistSnapshot('Interpol')],
        tracksPerSeed: 5,
        popularity: PopularityMode.BALANCED,
      });

      expect(playlist.tracks).toHaveLength(10);
      expect(
        playlist.tracks.every((track) => track.artistName === 'Interpol'),
      ).toBe(true);
    });

    it('never counts a track the caller rejects and refills past it', async () => {
      const world = createWorld({
        artistCharts: { Radiohead: titles('Radiohead', 20) },
      });
      const excluded = new Set(titles('Radiohead', 6));

      const playlist = await world.artistMix.execute(
        {
          kind: 'artist_mix',
          artistIds: ['radiohead'],
          artists: [artistSnapshot('Radiohead')],
          tracksPerSeed: 10,
          popularity: PopularityMode.POPULAR,
        },
        { acceptTrack: (track) => !excluded.has(track.name) },
      );

      expect(playlist.tracks).toHaveLength(10);
      expect(playlist.tracks.some((track) => excluded.has(track.name))).toBe(
        false,
      );
    });

    it('returns the genuine shortfall when every artist is exhausted', async () => {
      const world = createWorld({
        artistCharts: {
          Radiohead: titles('Radiohead', 3),
          Interpol: titles('Interpol', 4),
        },
      });

      const playlist = await world.artistMix.execute({
        kind: 'artist_mix',
        artistIds: ['radiohead', 'interpol'],
        artists: [artistSnapshot('Radiohead'), artistSnapshot('Interpol')],
        tracksPerSeed: 5,
        popularity: PopularityMode.BALANCED,
      });

      expect(playlist.tracks).toHaveLength(7);
    });
  });

  describe('Genre Mix', () => {
    function regionalWorld(input: {
      rockAt: number[];
      total: number;
      searchTracks?: Record<string, string[]>;
      artistCharts?: Record<string, string[]>;
    }) {
      const region = numbered('Act', input.total);
      const rock = new Set(input.rockAt.map((index) => region[index]));
      return createWorld({
        tagArtists: { argentina: region.map((name) => ({ name })) },
        artistTags: Object.fromEntries(
          region.map((name) => [
            name,
            [{ name: rock.has(name) ? 'rock' : 'cumbia', count: 100 }],
          ]),
        ),
        artistCharts:
          input.artistCharts ??
          Object.fromEntries(region.map((name) => [name, titles(name, 3)])),
        searchTracks: input.searchTracks,
      });
    }

    it('keeps exploring qualified regional artists until the regional target is met', async () => {
      const world = regionalWorld({
        total: 80,
        rockAt: [
          3,
          10,
          ...Array.from({ length: 10 }, (_, index) => 50 + index),
        ],
      });

      const playlist = await world.genreMix.execute({
        kind: 'genre_mix',
        genreIds: ['rock'],
        filters: { region: 'argentina' },
        tracksPerSeed: 10,
        popularity: PopularityMode.BALANCED,
      });

      expect(playlist.tracks).toHaveLength(10);
      expect(world.discovery.getTopTracksForTag).not.toHaveBeenCalled();
      expect(
        playlist.tracks.every((track) => /^Act \d+$/.test(track.artistName)),
      ).toBe(true);
    });

    it('returns only regional tracks when the regional candidate space is exhausted', async () => {
      const world = regionalWorld({
        total: 20,
        rockAt: [1, 5, 9],
        artistCharts: {
          'Act 2': titles('Act 2', 3),
          'Act 6': titles('Act 6', 3),
          'Act 10': titles('Act 10', 2),
        },
      });

      const playlist = await world.genreMix.execute({
        kind: 'genre_mix',
        genreIds: ['rock'],
        filters: { region: 'argentina' },
        tracksPerSeed: 10,
        popularity: PopularityMode.BALANCED,
      });

      expect(playlist.tracks).toHaveLength(8);
      expect(new Set(playlist.tracks.map((track) => track.artistName))).toEqual(
        new Set(['Act 2', 'Act 6', 'Act 10']),
      );
      expect(world.discovery.getTopTracksForTag).not.toHaveBeenCalled();
    });

    it('lets the seed-artist fallback complete a regional shortfall without leaving the region', async () => {
      const world = regionalWorld({
        total: 20,
        rockAt: [1, 5, 9, 13],
        artistCharts: {
          'Act 2': titles('Act 2', 3),
          'Act 6': titles('Act 6', 3),
          'Act 10': titles('Act 10', 2),
          'Act 14': [],
        },
        searchTracks: { 'Act 14': titles('Act 14', 3, 10) },
      });

      const playlist = await world.genreMix.execute({
        kind: 'genre_mix',
        genreIds: ['rock'],
        filters: { region: 'argentina' },
        tracksPerSeed: 10,
        popularity: PopularityMode.BALANCED,
      });

      expect(playlist.tracks).toHaveLength(10);
      expect(new Set(playlist.tracks.map((track) => track.artistName))).toEqual(
        new Set(['Act 2', 'Act 6', 'Act 10', 'Act 14']),
      );
    });

    it('replaces tracks shared by two genres with unused candidates of the later genre', async () => {
      const shared = ['Shared 1', 'Shared 2'].map((name) => ({
        artistName: name,
        trackName: `${name} Hit`,
      }));
      const chartOf = (prefix: string) =>
        numbered(prefix, 8).map((name) => ({
          artistName: name,
          trackName: `${name} Hit`,
        }));
      const world = createWorld({
        tagCharts: {
          rock: [...shared, ...chartOf('Rocker')],
          pop: [...shared, ...chartOf('Popper')],
        },
      });
      jest.spyOn(Math, 'random').mockReturnValue(0.999);

      const playlist = await world.genreMix.execute({
        kind: 'genre_mix',
        genreIds: ['rock', 'pop'],
        tracksPerSeed: 5,
        popularity: PopularityMode.POPULAR,
      });

      const names = playlist.tracks.map((track) => track.artistName);
      expect(playlist.tracks).toHaveLength(10);
      expect(new Set(names).size).toBe(10);
      expect(names.filter((name) => name.startsWith('Popper'))).toHaveLength(5);
    });
  });

  describe('Discover Artist', () => {
    it('reaches the target when early candidates miss Spotify, duplicate, or a similar artist runs dry', async () => {
      const longChart = [
        'Ghost Tune A',
        'Ghost Tune B',
        'Neighbor Song 1',
        'Neighbor Song 1 - Live',
        ...titles('Neighbor', 20, 2),
      ];
      const world = createWorld({
        similarArtists: ['Thin Artist', 'Neighbor'],
        artistCharts: {
          'Thin Artist': ['Only Song'],
          Neighbor: longChart,
        },
        unresolvable: new Set(['Ghost Tune A', 'Ghost Tune B']),
      });

      const playlist = await world.discover.execute({
        kind: 'discover_artist',
        artistId: 'sade',
        artist: { id: 'sade', name: 'Sade' },
        targetTrackCount: 12,
        popularity: PopularityMode.POPULAR,
        orderMode: 'random',
      });

      expect(playlist.tracks).toHaveLength(12);
      expect(versionKeys(playlist.tracks).size).toBe(12);
    });
  });

  describe('Discover Track', () => {
    const SEED = makeTrack('Sade', 'Smooth Operator');

    function discoverTrack(
      world: ReturnType<typeof createWorld>,
      targetTrackCount: number,
      options?: { acceptTrack?: (track: Track) => boolean },
    ) {
      world.catalog.searchTracks.mockResolvedValue([SEED]);
      return world.discover.execute(
        {
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
        },
        options,
      );
    }

    function neighbors(count: number): SimilarTrackCandidate[] {
      return Array.from({ length: count }, (_, index) => ({
        name: `Neighbor Tune ${index}`,
        artistName: `Neighbor ${index}`,
        playcount: 100_000 - index,
      }));
    }

    it('keeps resolving deeper similar tracks when early candidates miss Spotify', async () => {
      const similar = neighbors(100);
      const world = createWorld({
        similarTracks: similar,
        unresolvable: new Set(
          similar
            .filter((_, index) => index % 2 === 1)
            .map((candidate) => candidate.name),
        ),
      });

      const playlist = await discoverTrack(world, 15);

      expect(playlist.tracks).toHaveLength(15);
      expect(world.resolveTrack.mock.calls.length).toBeLessThanOrEqual(45);
    });

    it('continues into the similar-artist fallback when the similar-track answer is short', async () => {
      const world = createWorld({
        similarTracks: neighbors(10),
        similarArtists: ['Fallback One', 'Fallback Two'],
        artistCharts: {
          'Fallback One': titles('Fallback One', 4),
          'Fallback Two': titles('Fallback Two', 4),
        },
      });

      const playlist = await discoverTrack(world, 15);

      expect(playlist.tracks).toHaveLength(15);
      expect(playlist.tracks.some((track) => track.id.equals(SEED.id))).toBe(
        false,
      );
    });

    it('never counts a rejected track toward the target', async () => {
      const world = createWorld({ similarTracks: neighbors(40) });
      const rejected = new Set(neighbors(5).map((candidate) => candidate.name));

      const playlist = await discoverTrack(world, 15, {
        acceptTrack: (track) => !rejected.has(track.name),
      });

      expect(playlist.tracks).toHaveLength(15);
      expect(playlist.tracks.some((track) => rejected.has(track.name))).toBe(
        false,
      );
    });
  });
  describe('Region filter', () => {
    const ARGENTINA_TAGS = [
      { name: 'rock', count: 100 },
      { name: 'argentina', count: 70 },
    ];
    const ELSEWHERE_TAGS = [
      { name: 'rock', count: 100 },
      { name: 'british', count: 70 },
    ];

    function regionTags(
      ...names: string[]
    ): Record<string, ArtistTagCandidate[]> {
      return Object.fromEntries(
        names.map((name) => [
          name,
          name.startsWith('Arg') ? ARGENTINA_TAGS : ELSEWHERE_TAGS,
        ]),
      );
    }

    function isArgentine(track: Track): boolean {
      return track.artistName.startsWith('Arg');
    }

    describe('Discover Artist', () => {
      function discoverArtist(
        world: ReturnType<typeof createWorld>,
        targetTrackCount: number,
        region: MusicRegion | null = 'argentina',
      ) {
        return world.discover.execute({
          kind: 'discover_artist',
          artistId: 'radiohead',
          artist: { id: 'radiohead', name: 'Radiohead' },
          targetTrackCount,
          popularity: PopularityMode.POPULAR,
          orderMode: 'random',
          filters: { region },
        });
      }

      it('only lets discovered artists of the region contribute tracks', async () => {
        const world = createWorld({
          similarArtists: ['Arg A', 'Other B', 'Arg C'],
          artistTags: regionTags('Arg A', 'Other B', 'Arg C'),
          artistCharts: {
            'Arg A': titles('Arg A', 10),
            'Other B': titles('Other B', 10),
            'Arg C': titles('Arg C', 10),
          },
        });

        const playlist = await discoverArtist(world, 6);

        expect(playlist.tracks).toHaveLength(6);
        expect(playlist.tracks.every(isArgentine)).toBe(true);
        expect(world.catalog.searchArtists).not.toHaveBeenCalledWith(
          'Other B',
          expect.anything(),
        );
        expect(playlist.generation).toMatchObject({
          kind: 'discover_artist',
          filters: { region: 'argentina' },
        });
      });

      it('keeps exploring later similar artists until the region target is met', async () => {
        const similar = ['Arg 1', 'Non 1', 'Non 2', 'Arg 2', 'Non 3', 'Arg 3'];
        const world = createWorld({
          similarArtists: similar,
          artistTags: regionTags(...similar),
          artistCharts: {
            'Arg 1': titles('Arg 1', 3),
            'Arg 2': titles('Arg 2', 3),
            'Arg 3': titles('Arg 3', 10),
            'Non 1': titles('Non 1', 10),
            'Non 2': titles('Non 2', 10),
            'Non 3': titles('Non 3', 10),
          },
        });

        const playlist = await discoverArtist(world, 10);

        expect(playlist.tracks).toHaveLength(10);
        expect(playlist.tracks.every(isArgentine)).toBe(true);
      });

      it('never requires the seed artist itself to belong to the region', async () => {
        const world = createWorld({
          similarArtists: ['Arg 1', 'Arg 2'],
          artistTags: {
            ...regionTags('Arg 1', 'Arg 2'),
            radiohead: ELSEWHERE_TAGS,
          },
          artistCharts: {
            'Arg 1': titles('Arg 1', 5),
            'Arg 2': titles('Arg 2', 5),
          },
        });

        const playlist = await discoverArtist(world, 8);

        expect(playlist.tracks).toHaveLength(8);
        expect(world.discovery.getTopTagsForArtist).not.toHaveBeenCalledWith(
          expect.objectContaining({ name: 'radiohead' }),
        );
      });

      it('returns only regional tracks when the similar artists are exhausted', async () => {
        const similar = ['Arg 1', 'Non 1', 'Arg 2', 'Non 2', 'Non 3'];
        const world = createWorld({
          similarArtists: similar,
          artistTags: regionTags(...similar),
          artistCharts: {
            'Arg 1': titles('Arg 1', 3),
            'Arg 2': titles('Arg 2', 4),
            'Non 1': titles('Non 1', 10),
            'Non 2': titles('Non 2', 10),
            'Non 3': titles('Non 3', 10),
          },
        });

        const playlist = await discoverArtist(world, 10);

        expect(playlist.tracks).toHaveLength(7);
        expect(playlist.tracks.every(isArgentine)).toBe(true);
      });

      it('qualifies the Last.fm artist identity by MBID when Last.fm provides one', async () => {
        const world = createWorld({
          similarArtists: [
            { name: 'Arg Homonym', mbid: 'mbid-arg' },
            { name: 'Arg 2' },
          ],
          artistTags: {
            'mbid-arg': ARGENTINA_TAGS,
            'Arg Homonym': ELSEWHERE_TAGS,
            'Arg 2': ARGENTINA_TAGS,
          },
          artistCharts: {
            'Arg Homonym': titles('Arg Homonym', 4),
            'Arg 2': titles('Arg 2', 4),
          },
        });

        const playlist = await discoverArtist(world, 8);

        expect(playlist.tracks).toHaveLength(8);
        expect(world.discovery.getTopTagsForArtist).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'Arg Homonym', mbid: 'mbid-arg' }),
        );
      });

      it('skips artists whose region lookup failed and keeps the constraint', async () => {
        const similar = ['Arg 1', 'Arg 2', 'Arg 3'];
        const world = createWorld({
          similarArtists: similar,
          artistTags: regionTags(...similar),
          failingTagLookups: new Set(['Arg 1']),
          artistCharts: Object.fromEntries(
            similar.map((name) => [name, titles(name, 5)]),
          ),
        });

        const playlist = await discoverArtist(world, 6);

        expect(playlist.tracks).toHaveLength(6);
        expect(
          playlist.tracks.some((track) => track.artistName === 'Arg 1'),
        ).toBe(false);
      });

      it('fails as unavailable instead of dropping the region when every lookup fails', async () => {
        const similar = ['Arg 1', 'Arg 2', 'Arg 3'];
        const world = createWorld({
          similarArtists: similar,
          failingTagLookups: new Set(similar),
          artistCharts: Object.fromEntries(
            similar.map((name) => [name, titles(name, 5)]),
          ),
        });

        await expect(discoverArtist(world, 6)).rejects.toMatchObject({
          code: 'REGION_LOOKUP_UNAVAILABLE',
        });
        expect(world.resolveTrack).not.toHaveBeenCalled();
      });

      it('skips region lookups entirely without a region', async () => {
        const world = createWorld({
          similarArtists: ['Non 1', 'Non 2'],
          artistCharts: {
            'Non 1': titles('Non 1', 5),
            'Non 2': titles('Non 2', 5),
          },
        });

        const playlist = await discoverArtist(world, 6, null);

        expect(playlist.tracks).toHaveLength(6);
        expect(world.discovery.getTopTagsForArtist).not.toHaveBeenCalled();
      });
    });

    describe('Discover Track', () => {
      const SEED = makeTrack('Sade', 'Smooth Operator');

      function discoverTrack(
        world: ReturnType<typeof createWorld>,
        targetTrackCount: number,
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
          filters: { region: 'argentina' },
        });
      }

      function candidates(
        artists: string[],
        perArtist = 1,
      ): SimilarTrackCandidate[] {
        return artists.flatMap((artistName, index) =>
          Array.from({ length: perArtist }, (_, take) => ({
            name: `${artistName} Tune ${take + 1}`,
            artistName,
            playcount: 100_000 - index * perArtist - take,
          })),
        );
      }

      it('filters result artists by region before they count toward the target', async () => {
        const artists = Array.from({ length: 40 }, (_, index) =>
          index % 2 === 0 ? `Arg ${index}` : `Non ${index}`,
        );
        const world = createWorld({
          similarTracks: candidates(artists),
          artistTags: regionTags(...artists, 'Sade'),
        });

        const playlist = await discoverTrack(world, 10);

        expect(playlist.tracks).toHaveLength(10);
        expect(playlist.tracks.every(isArgentine)).toBe(true);
        expect(
          world.resolveTrack.mock.calls.every(([artistName]) =>
            artistName.startsWith('Arg'),
          ),
        ).toBe(true);
        expect(playlist.generation).toMatchObject({
          kind: 'discover_track',
          filters: { region: 'argentina' },
        });
      });

      it('looks up the region of each result artist once per request', async () => {
        const artists = ['Arg A', 'Arg B', 'Non C'];
        const world = createWorld({
          similarTracks: candidates(artists, 6),
          artistTags: regionTags(...artists),
        });

        const playlist = await discoverTrack(world, 10);
        const lookups = world.discovery.getTopTagsForArtist.mock.calls.map(
          ([artist]) => artist.name,
        );

        expect(playlist.tracks).toHaveLength(10);
        expect(lookups.sort()).toEqual(['Arg A', 'Arg B', 'Non C']);
        expect(lookups).not.toContain('Sade');
      });

      it('continues into the similar-artist candidates when the region thins the similar tracks', async () => {
        const artists = [
          ...Array.from({ length: 4 }, (_, index) => `Arg ${index}`),
          ...Array.from({ length: 30 }, (_, index) => `Non ${index}`),
        ];
        const world = createWorld({
          similarTracks: candidates(artists),
          similarArtists: ['Non Fallback', 'Arg Fallback'],
          artistTags: regionTags(...artists, 'Non Fallback', 'Arg Fallback'),
          artistCharts: {
            'Non Fallback': titles('Non Fallback', 8),
            'Arg Fallback': titles('Arg Fallback', 8),
          },
        });

        const playlist = await discoverTrack(world, 10);

        expect(playlist.tracks).toHaveLength(10);
        expect(playlist.tracks.every(isArgentine)).toBe(true);
        expect(
          playlist.tracks.some((track) => track.artistName === 'Arg Fallback'),
        ).toBe(true);
      });

      it('returns the regional shortfall instead of relaxing the region', async () => {
        const artists = [
          ...Array.from({ length: 6 }, (_, index) => `Arg ${index}`),
          ...Array.from({ length: 30 }, (_, index) => `Non ${index}`),
        ];
        const world = createWorld({
          similarTracks: candidates(artists),
          artistTags: regionTags(...artists),
        });

        const playlist = await discoverTrack(world, 10);

        expect(playlist.tracks).toHaveLength(6);
        expect(playlist.tracks.every(isArgentine)).toBe(true);
      });

      it('qualifies a collaboration by its primary credited artist', async () => {
        const world = createWorld({
          similarTracks: [
            ...candidates(['Arg Lead feat. Non Guest']),
            ...candidates(['Arg 1', 'Arg 2', 'Arg 3', 'Non 4']),
          ],
          artistTags: regionTags(
            'Arg Lead',
            'Arg 1',
            'Arg 2',
            'Arg 3',
            'Non 4',
          ),
        });

        const playlist = await discoverTrack(world, 4);

        expect(playlist.tracks.map((track) => track.artistName).sort()).toEqual(
          ['Arg 1', 'Arg 2', 'Arg 3', 'Arg Lead feat. Non Guest'],
        );
        expect(world.discovery.getTopTagsForArtist).toHaveBeenCalledWith({
          name: 'Arg Lead',
        });
      });

      it('fails as unavailable instead of dropping the region when every lookup fails', async () => {
        const artists = ['Arg 1', 'Arg 2', 'Arg 3', 'Arg 4', 'Arg 5'];
        const world = createWorld({
          similarTracks: candidates(artists),
          failingTagLookups: new Set(artists),
        });

        await expect(discoverTrack(world, 4)).rejects.toMatchObject({
          code: 'REGION_LOOKUP_UNAVAILABLE',
        });
        expect(world.resolveTrack).not.toHaveBeenCalled();
      });
    });
  });
});
