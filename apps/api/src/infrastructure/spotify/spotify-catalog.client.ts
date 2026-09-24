import axios, { type AxiosRequestConfig } from 'axios';
import { Artist } from '../../domain/artist/artist.entity';
import { CatalogUnavailableError } from '../../domain/errors/catalog-unavailable.error';
import {
  isFatalCatalogError,
  isSpotifyQuotaError,
} from '../../domain/genre/catalog-resolve';
import type {
  CatalogProviderPort,
  ResolveTrackOptions,
  SearchTracksOptions,
} from '../../domain/repositories/catalog-provider.port';
import { Track, type TrackArtist } from '../../domain/track/track.entity';
import { ArtistId } from '../../domain/value-objects/artist-id.vo';
import { TrackId } from '../../domain/value-objects/track-id.vo';
import { RedisCacheService } from '../cache/redis-cache.service';
import { pickResolvedTrack } from './pick-resolved-track';
import { SpotifyApiClient } from './spotify-api.client';

export interface CatalogTokenSource {
  getAccessToken(): Promise<string>;
  invalidate(token: string): void;
}

interface SpotifyImage {
  url: string;
}

interface SpotifyArtist {
  id: string;
  name: string;
  images?: SpotifyImage[];
}

interface SpotifyTrack {
  id: string;
  name: string;
  duration_ms: number;
  popularity?: number;
  uri: string;
  preview_url?: string | null;
  artists: { id: string; name: string }[];
  album?: { name: string; images?: SpotifyImage[] };
  external_ids?: { isrc?: string | null };
  external_urls?: { spotify?: string | null };
}

type CachedArtist = {
  id: string;
  name: string;
  imageUrl?: string;
};

type CachedTrack = {
  id: string;
  name: string;
  artistId: string;
  artistName: string;
  durationMs: number;
  popularity: number;
  uri: string;
  albumName?: string;
  albumImageUrl?: string;
  previewUrl?: string;
  artists?: TrackArtist[];
  isrc?: string;
  externalUrl?: string;
};

const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const ARTIST_CACHE_TTL_MS = 30 * 60 * 1000;

export class SpotifyCatalogClient implements CatalogProviderPort {
  constructor(
    private readonly api: SpotifyApiClient,
    private readonly tokens: CatalogTokenSource,
    private readonly market: string,
    private readonly cache?: RedisCacheService,
  ) {}

  async searchArtists(query: string, limit = 10): Promise<Artist[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 10);
    const key = this.cacheKey('search-artists', query, safeLimit);
    const cached = await this.cache?.getJson<CachedArtist[]>(key);
    if (cached) return cached.map(hydrateArtist);

    const data = await this.request<{
      artists: { items: SpotifyArtist[] };
    }>('searchArtists', {
      method: 'GET',
      url: '/search',
      params: {
        q: query,
        type: 'artist',
        limit: safeLimit,
        ...this.marketParam(),
      },
    });

    const artists = (data.artists?.items ?? []).map(mapArtist);
    await Promise.all([
      this.cache?.setJson(
        key,
        artists.map(serializeArtist),
        SEARCH_CACHE_TTL_MS,
      ),
      ...artists.map((artist) => this.cacheArtist(artist)),
    ]);
    return artists;
  }

  async searchTracks(
    query: string,
    options: SearchTracksOptions = {},
  ): Promise<Track[]> {
    const safeLimit = Math.min(Math.max(options.limit ?? 10, 1), 10);
    const offset = Math.max(options.offset ?? 0, 0);
    const key = this.cacheKey('search-tracks', query, safeLimit, offset);
    const cached = await this.cache?.getJson<CachedTrack[]>(key);
    if (cached) return cached.map(hydrateTrack);

    const data = await this.request<{
      tracks: { items: SpotifyTrack[] };
    }>('searchTracks', {
      method: 'GET',
      url: '/search',
      params: {
        q: query,
        type: 'track',
        limit: safeLimit,
        offset,
        ...this.marketParam(),
      },
    });

    const tracks = (data.tracks?.items ?? [])
      .filter((item): item is SpotifyTrack => Boolean(item?.id && item?.uri))
      .map((item) => mapTrack(item));
    await this.cache?.setJson(
      key,
      tracks.map(serializeTrack),
      SEARCH_CACHE_TTL_MS,
    );
    return tracks;
  }

  async resolveTrack(
    artistName: string,
    trackName: string,
    options: ResolveTrackOptions = {},
  ): Promise<Track | null> {
    const artist = artistName.trim();
    const title = trackName.trim();
    if (!artist || !title) return null;
    const expectedArtistId = options.artistId?.trim() || undefined;

    try {
      const data = await this.request<{
        tracks: { items: SpotifyTrack[] };
      }>('resolveTrack', {
        method: 'GET',
        url: '/search',
        params: {
          q: `track:"${title}" artist:"${artist}"`,
          type: 'track',
          limit: 10,
          offset: 0,
          ...this.marketParam(),
        },
      });

      const items = (data.tracks?.items ?? []).filter(
        (item): item is SpotifyTrack => Boolean(item?.id && item?.uri),
      );

      const scoped = expectedArtistId
        ? items.filter((item) =>
            item.artists?.some((a) => a.id === expectedArtistId),
          )
        : items;

      if (scoped.length === 0) return null;

      const tracks = scoped.map((item) => {
        const credited =
          (expectedArtistId
            ? item.artists.find((a) => a.id === expectedArtistId)
            : undefined) ?? item.artists[0];
        return mapTrack(item, {
          id: credited?.id ?? expectedArtistId ?? 'unknown',
          name: credited?.name ?? artist,
        });
      });

      return pickResolvedTrack(tracks, artist, title, {
        requireArtistNameMatch: !expectedArtistId,
      });
    } catch (error) {
      if (isFatalCatalogError(error)) throw error;
      return null;
    }
  }

  async getArtistsByIds(ids: string[]): Promise<Artist[]> {
    if (ids.length === 0) return [];
    const byId = new Map<string, Artist>();
    const missing: string[] = [];

    for (const id of ids) {
      const cached = await this.getCachedArtist(id);
      if (cached) byId.set(id, cached);
      else missing.push(id);
    }

    for (const id of missing) {
      const data = await this.request<SpotifyArtist>(`getArtist(${id})`, {
        method: 'GET',
        url: `/artists/${id}`,
      });
      const artist = mapArtist(data);
      await this.cacheArtist(artist);
      byId.set(id, artist);
    }

    return ids.map((id) => byId.get(id)).filter((a): a is Artist => Boolean(a));
  }

  private cacheKey(
    namespace: string,
    query: string,
    ...parts: number[]
  ): string {
    const normalized = query.trim().toLowerCase();
    return `spotify:${namespace}:${this.market}:${encodeURIComponent(
      normalized,
    )}:${parts.join(':')}`;
  }

  private marketParam(): { market: string } {
    return { market: this.market };
  }

  private async request<T>(
    operation: string,
    config: AxiosRequestConfig,
  ): Promise<T> {
    const token = await this.acquireToken();
    try {
      return (await this.api.raw<T>(token, config)).data;
    } catch (error) {
      if (!this.api.isStatus(error, 401)) {
        throw this.toCatalogError(operation, error);
      }
      this.tokens.invalidate(token);
    }

    const retryToken = await this.acquireToken();
    try {
      return (await this.api.raw<T>(retryToken, config)).data;
    } catch (error) {
      if (this.api.isStatus(error, 401)) {
        this.tokens.invalidate(retryToken);
        throw new CatalogUnavailableError({
          cause: this.api.toSpotifyError(operation, error),
        });
      }
      throw this.toCatalogError(operation, error);
    }
  }

  private async acquireToken(): Promise<string> {
    try {
      return await this.tokens.getAccessToken();
    } catch (error) {
      if (isSpotifyQuotaError(error)) throw error;
      throw new CatalogUnavailableError({ cause: error });
    }
  }

  private toCatalogError(operation: string, error: unknown): Error {
    const converted = this.api.toSpotifyError(operation, error);
    if (isSpotifyQuotaError(converted) || !isProviderUnavailable(error)) {
      return converted;
    }
    return new CatalogUnavailableError({ cause: converted });
  }

  private getCachedArtist(id: string): Promise<Artist | null> {
    if (!this.cache) return Promise.resolve(null);
    return this.cache
      .getJson<CachedArtist>(`spotify:artist:${id}`)
      .then((artist) => (artist ? hydrateArtist(artist) : null));
  }

  private async cacheArtist(artist: Artist): Promise<void> {
    await this.cache?.setJson(
      `spotify:artist:${artist.id.getValue()}`,
      serializeArtist(artist),
      ARTIST_CACHE_TTL_MS,
    );
  }
}

function mapArtist(item: SpotifyArtist): Artist {
  return Artist.create({
    id: ArtistId.create(item.id),
    name: item.name,
    imageUrl: item.images?.[0]?.url,
  });
}

function mapTrack(
  item: SpotifyTrack,
  preferredArtist?: { id: string; name: string },
): Track {
  const artist = preferredArtist ??
    item.artists[0] ?? {
      id: 'unknown',
      name: 'Unknown',
    };
  return Track.create({
    id: TrackId.create(item.id),
    name: item.name,
    artistId: ArtistId.create(artist.id),
    artistName: artist.name,
    durationMs: item.duration_ms,
    popularity: item.popularity ?? 0,
    uri: item.uri,
    albumName: item.album?.name,
    albumImageUrl: item.album?.images?.[0]?.url,
    previewUrl: item.preview_url ?? undefined,
    artists: item.artists,
    isrc: item.external_ids?.isrc ?? undefined,
    externalUrl: item.external_urls?.spotify ?? undefined,
  });
}

function serializeArtist(artist: Artist): CachedArtist {
  return {
    id: artist.id.getValue(),
    name: artist.name,
    imageUrl: artist.imageUrl,
  };
}

function hydrateArtist(artist: CachedArtist): Artist {
  return Artist.create({
    id: ArtistId.create(artist.id),
    name: artist.name,
    imageUrl: artist.imageUrl,
  });
}

function serializeTrack(track: Track): CachedTrack {
  return {
    id: track.id.getValue(),
    name: track.name,
    artistId: track.artistId.getValue(),
    artistName: track.artistName,
    durationMs: track.durationMs,
    popularity: track.popularity,
    uri: track.uri,
    albumName: track.albumName,
    albumImageUrl: track.albumImageUrl,
    previewUrl: track.previewUrl,
    artists: [...track.artists],
    isrc: track.isrc,
    externalUrl: track.externalUrl,
  };
}

function hydrateTrack(track: CachedTrack): Track {
  return Track.create({
    id: TrackId.create(track.id),
    name: track.name,
    artistId: ArtistId.create(track.artistId),
    artistName: track.artistName,
    durationMs: track.durationMs,
    popularity: track.popularity,
    uri: track.uri,
    albumName: track.albumName,
    albumImageUrl: track.albumImageUrl,
    previewUrl: track.previewUrl,
    artists: track.artists,
    isrc: track.isrc,
    externalUrl: track.externalUrl,
  });
}

function isProviderUnavailable(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === undefined || status === 403 || status >= 500;
}
