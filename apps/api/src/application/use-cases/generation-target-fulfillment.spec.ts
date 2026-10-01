import { PopularityMode } from '@blendify/contracts';
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
  similarArtists?: string[];
  similarTracks?: SimilarTrackCandidate[];
  searchTracks?: Record<string, string[]>;
};

function createWorld(input: WorldInput) {
  const unresolvable = input.unresolvable ?? new Set<string>();
  const discovery = {
    isConfigured: () => true,
    getSimilarArtists: jest.fn(() =>
      Promise.resolve(
        (input.similarArtists ?? []).map((name) => ({ name, match: 1 })),
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
      Promise.resolve(input.artistTags?.[artist.name] ?? []),
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
        region: 'argentina',
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
        region: 'argentina',
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
        region: 'argentina',
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
});
