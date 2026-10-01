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
import { Track, type TrackProps } from '@/domain/track/track.entity';
import { ArtistId } from '@/domain/value-objects/artist-id.vo';
import { TrackId } from '@/domain/value-objects/track-id.vo';
import { GenreTrackCatalogService } from '@/application/services/genre-track-catalog.service';
import { GenerateArtistMixUseCase } from './generate-artist-mix.use-case';
import { GenerateDiscoverPlaylistUseCase } from './generate-discover-playlist.use-case';
import { GenerateGenreMixUseCase } from './generate-genre-mix.use-case';

export function slug(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
}

export function makeTrack(
  artistName: string,
  title: string,
  release?: TrackRelease,
): Track {
  const id = `${slug(artistName)}--${slug(title)}`;
  return Track.create({
    id: TrackId.create(id),
    name: title,
    artistId: ArtistId.create(slug(artistName)),
    artistName,
    durationMs: 200_000,
    popularity: 50,
    uri: `spotify:track:${id}`,
    albumName: release?.albumName,
    releaseDate: release?.releaseDate,
    releaseDatePrecision: release?.releaseDatePrecision,
  });
}

export type TrackRelease = Pick<
  TrackProps,
  'albumName' | 'releaseDate' | 'releaseDatePrecision'
>;

export function titles(
  artistName: string,
  count: number,
  offset = 1,
): string[] {
  return Array.from(
    { length: count },
    (_, index) => `${artistName} Song ${index + offset}`,
  );
}

export function numbered(prefix: string, count: number, offset = 1): string[] {
  return Array.from(
    { length: count },
    (_, index) => `${prefix} ${index + offset}`,
  );
}

export type WorldInput = {
  artistCharts?: Record<string, string[]>;
  unresolvable?: Set<string>;
  tagCharts?: Record<string, CatalogTrackCandidate[]>;
  tagArtists?: Record<string, SimilarArtistCandidate[]>;
  artistTags?: Record<string, ArtistTagCandidate[]>;
  failingTagLookups?: Set<string>;
  similarArtists?: Array<string | SimilarArtistCandidate>;
  similarTracks?: SimilarTrackCandidate[];
  searchTracks?: Record<string, string[]>;
  releases?: Record<string, TrackRelease>;
};

export function createWorld(input: WorldInput) {
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
      unresolvable.has(title)
        ? null
        : makeTrack(artistName, title, input.releases?.[title]),
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
          makeTrack(artistName, title, input.releases?.[title]),
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

export function artistSnapshot(name: string) {
  return { id: slug(name), name };
}

export function versionKeys(tracks: readonly Track[]): Set<string> {
  return new Set(
    tracks.map(
      (track) =>
        `${track.artistId.getValue()}::${track.name.replace(/ - .*$/, '')}`,
    ),
  );
}
