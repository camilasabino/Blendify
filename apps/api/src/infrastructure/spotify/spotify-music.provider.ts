import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { randomUUID } from 'crypto';
import { Artist } from '../../domain/artist/artist.entity';
import { Track } from '../../domain/track/track.entity';
import { User } from '../../domain/user/user.entity';
import { ArtistId } from '../../domain/value-objects/artist-id.vo';
import { TrackId } from '../../domain/value-objects/track-id.vo';
import {
  CreateProviderPlaylistInput,
  MusicProviderPort,
  ProviderPlaylist,
} from '../../domain/repositories/music-provider.port';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import { SpotifyTokenService } from '../auth/spotify-token.service';
import { attachSpotifyRateLimit } from './spotify-rate-limit';

interface SpotifyImage {
  url: string;
}

interface SpotifyArtist {
  id: string;
  name: string;
  images?: SpotifyImage[];
  genres?: string[];
  popularity?: number;
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
}

interface SpotifyAlbumSummary {
  id: string;
  name: string;
  album_type?: string;
  images?: SpotifyImage[];
}

const SIMILAR_CACHE_TTL_MS = 5 * 60 * 1000;
const similarArtistsCache = new Map<
  string,
  { artists: Artist[]; expiresAt: number }
>();

const SEARCH_CACHE_TTL_MS = 2 * 60 * 1000;
const searchArtistsCache = new Map<
  string,
  { artists: Artist[]; expiresAt: number }
>();

const ARTIST_CACHE_TTL_MS = 30 * 60 * 1000;
const artistByIdCache = new Map<
  string,
  { artist: Artist; expiresAt: number }
>();

function cacheArtist(artist: Artist): void {
  artistByIdCache.set(artist.id.getValue(), {
    artist,
    expiresAt: Date.now() + ARTIST_CACHE_TTL_MS,
  });
}

function formatRetryWait(
  seconds: number | null,
  quotaExceeded: boolean,
): string {
  if (seconds != null && seconds > 0) {
    if (seconds < 90) return `about ${Math.ceil(seconds)} seconds`;
    if (seconds < 3600) return `about ${Math.ceil(seconds / 60)} minutes`;
    const hours = Math.ceil(seconds / 3600);
    return `about ${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return quotaExceeded ? 'several hours' : 'about 20 seconds';
}

@Injectable()
export class SpotifyMusicProvider implements MusicProviderPort {
  private readonly logger = new Logger(SpotifyMusicProvider.name);
  private readonly api: AxiosInstance;
  private userId: string | null = null;

  constructor(private readonly tokenService: SpotifyTokenService) {
    this.api = axios.create({
      baseURL: 'https://api.spotify.com/v1',
      timeout: 20_000,
    });
    attachSpotifyRateLimit(this.api, this.logger);
  }

  forUser(userId: string): MusicProviderPort {
    const bound = Object.create(this) as SpotifyMusicProvider;
    bound.userId = userId;
    return bound;
  }

  async searchArtists(query: string, limit = 10): Promise<Artist[]> {
    const token = await this.requireAccessToken();
    const safeLimit = Math.min(Math.max(limit, 1), 10);
    const cacheKey = `${query.trim().toLowerCase()}|${safeLimit}`;
    const cached = searchArtistsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.artists;
    }

    try {
      const { data } = await this.api.get<{
        artists: { items: SpotifyArtist[] };
      }>('/search', {
        params: { q: query, type: 'artist', limit: safeLimit },
        headers: { Authorization: `Bearer ${token}` },
      });

      const artists = (data.artists?.items ?? []).map((item) =>
        this.mapArtist(item),
      );
      for (const artist of artists) cacheArtist(artist);
      searchArtistsCache.set(cacheKey, {
        artists,
        expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
      });
      return artists;
    } catch (error) {
      throw this.toSpotifyError('searchArtists', error);
    }
  }

  async searchTracks(
    query: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<Track[]> {
    const token = await this.requireAccessToken();
    const safeLimit = Math.min(Math.max(options.limit ?? 10, 1), 10);
    const offset = Math.max(options.offset ?? 0, 0);

    try {
      const { data } = await this.api.get<{
        tracks: { items: SpotifyTrack[] };
      }>('/search', {
        params: {
          q: query,
          type: 'track',
          limit: safeLimit,
          offset,
        },
        headers: { Authorization: `Bearer ${token}` },
      });

      return (data.tracks?.items ?? [])
        .filter((item): item is SpotifyTrack => Boolean(item?.id && item?.uri))
        .map((item) =>
          this.mapTrack(
            item,
            item.artists[0]?.id ?? 'unknown',
            item.artists[0]?.name ?? 'Unknown',
          ),
        );
    } catch (error) {
      throw this.toSpotifyError('searchTracks', error);
    }
  }

  async getArtistsByIds(ids: string[]): Promise<Artist[]> {
    if (ids.length === 0) return [];
    const token = await this.requireAccessToken();

    const byId = new Map<string, Artist>();
    const missing: string[] = [];

    for (const id of ids) {
      const cached = artistByIdCache.get(id);
      if (cached && cached.expiresAt > Date.now()) {
        byId.set(id, cached.artist);
      } else {
        missing.push(id);
      }
    }

    for (const id of missing) {
      try {
        const { data } = await this.api.get<SpotifyArtist>(`/artists/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const artist = this.mapArtist(data);
        cacheArtist(artist);
        byId.set(id, artist);
      } catch (error) {
        throw this.toSpotifyError(`getArtist(${id})`, error);
      }
    }

    return ids.map((id) => byId.get(id)).filter((a): a is Artist => Boolean(a));
  }

  async getSimilarArtists(
    artistId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<{ artists: Artist[]; hasMore: boolean }> {
    const token = await this.requireAccessToken();
    const limit = Math.min(Math.max(options.limit ?? 8, 1), 50);
    const offset = Math.max(options.offset ?? 0, 0);

    const cached = similarArtistsCache.get(artistId);
    if (cached && cached.expiresAt > Date.now()) {
      const page = cached.artists.slice(offset, offset + limit);
      return {
        artists: page,
        hasMore: cached.artists.length > offset + limit,
      };
    }

    try {
      try {
        const { data: related } = await this.api.get<{
          artists: SpotifyArtist[];
        }>(`/artists/${artistId}/related-artists`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const relatedArtists = (related.artists ?? []).filter(
          (a) => a?.id && a.id !== artistId,
        );
        if (relatedArtists.length > 0) {
          const mapped = relatedArtists.map((a) => this.mapArtist(a));
          for (const artist of mapped) cacheArtist(artist);
          similarArtistsCache.set(artistId, {
            artists: mapped,
            expiresAt: Date.now() + SIMILAR_CACHE_TTL_MS,
          });
          return {
            artists: mapped.slice(offset, offset + limit),
            hasMore: mapped.length > offset + limit,
          };
        }
      } catch {
        void 0;
      }

      const { data: seed } = await this.api.get<SpotifyArtist>(
        `/artists/${artistId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      cacheArtist(this.mapArtist(seed));

      const broadGenres = new Set([
        'classical',
        'pop',
        'rock',
        'hip hop',
        'rap',
        'dance',
        'electronic',
        'edm',
        'latin',
        'indie',
        'alternative',
        'metal',
        'jazz',
        'folk',
        'soul',
        'r&b',
        'country',
        'blues',
        'punk',
      ]);

      const genres = [...(seed.genres ?? [])]
        .map((g) => g.trim().toLowerCase())
        .filter(Boolean)
        .sort((a, b) => {
          const aBroad = broadGenres.has(a) ? 1 : 0;
          const bBroad = broadGenres.has(b) ? 1 : 0;
          if (aBroad !== bBroad) return aBroad - bBroad;
          return b.length - a.length;
        });

      const genre = genres[0];
      const pool = new Map<string, SpotifyArtist>();

      if (genre) {
        try {
          const { data } = await this.api.get<{
            artists: { items: SpotifyArtist[] };
          }>('/search', {
            params: {
              q: `genre:"${genre}"`,
              type: 'artist',
              limit: 10,
              offset: 0,
            },
            headers: { Authorization: `Bearer ${token}` },
          });
          for (const item of data.artists?.items ?? []) {
            if (item?.id && item.id !== artistId) pool.set(item.id, item);
          }
        } catch {
          void 0;
        }
      }

      const ranked = Array.from(pool.values()).sort(
        (a, b) => (b.popularity ?? 0) - (a.popularity ?? 0),
      );
      const mapped = ranked.map((entry) => this.mapArtist(entry));
      for (const artist of mapped) cacheArtist(artist);
      similarArtistsCache.set(artistId, {
        artists: mapped,
        expiresAt: Date.now() + SIMILAR_CACHE_TTL_MS,
      });

      return {
        artists: mapped.slice(offset, offset + limit),
        hasMore: mapped.length > offset + limit,
      };
    } catch (error) {
      throw this.toSpotifyError(`getSimilarArtists(${artistId})`, error);
    }
  }

  private isNameLookalike(seedName: string, candidateName: string): boolean {
    const normalize = (value: string) =>
      value
        .toLowerCase()
        .replace(/^the\s+/, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const a = normalize(seedName);
    const b = normalize(candidateName);
    if (!a || !b) return true;
    if (a === b) return true;
    if (a.includes(b) || b.includes(a)) return true;
    const aTokens = new Set(a.split(' ').filter((t) => t.length > 2));
    const bTokens = b.split(' ').filter((t) => t.length > 2);
    if (aTokens.size === 0) return false;
    const shared = bTokens.filter((t) => aTokens.has(t)).length;
    return shared >= Math.min(2, aTokens.size);
  }

  private async artistsFromGenreTracks(
    token: string,
    genre: string,
    maxArtists: number,
  ): Promise<SpotifyArtist[]> {
    const artistIds: string[] = [];
    const seen = new Set<string>();

    try {
      const { data } = await this.api.get<{
        tracks: { items: SpotifyTrack[] };
      }>('/search', {
        params: {
          q: `genre:"${genre}"`,
          type: 'track',
          limit: 10,
          offset: 0,
        },
        headers: { Authorization: `Bearer ${token}` },
      });

      for (const track of data.tracks?.items ?? []) {
        const primary = track.artists?.[0];
        if (!primary?.id || seen.has(primary.id)) continue;
        seen.add(primary.id);
        artistIds.push(primary.id);
        if (artistIds.length >= maxArtists) break;
      }
    } catch {
      return [];
    }

    const artists = await Promise.all(
      artistIds.slice(0, maxArtists).map(async (id) => {
        try {
          const { data } = await this.api.get<SpotifyArtist>(`/artists/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          return data;
        } catch {
          return null;
        }
      }),
    );

    return artists.filter((a): a is SpotifyArtist => Boolean(a));
  }

  private async inferPeersFromTracks(
    token: string,
    artistId: string,
    artistName: string,
  ): Promise<{ peers: SpotifyArtist[]; genres: string[] }> {
    const peerIds = new Set<string>();
    const genreCounts = new Map<string, number>();
    const pageSize = 10;

    for (let offset = 0; offset < 30 && peerIds.size < 20; offset += pageSize) {
      try {
        const { data } = await this.api.get<{
          tracks: { items: SpotifyTrack[] };
        }>('/search', {
          params: {
            q: `artist:"${artistName}"`,
            type: 'track',
            limit: pageSize,
            offset,
          },
          headers: { Authorization: `Bearer ${token}` },
        });

        const items = data.tracks?.items ?? [];
        if (items.length === 0) break;

        for (const track of items) {
          const onTrack = track.artists?.some((a) => a.id === artistId);
          if (!onTrack) continue;
          for (const a of track.artists ?? []) {
            if (a.id && a.id !== artistId) peerIds.add(a.id);
          }
        }
      } catch {
        break;
      }
    }

    const peers: SpotifyArtist[] = [];
    for (const id of [...peerIds].slice(0, 15)) {
      try {
        const { data } = await this.api.get<SpotifyArtist>(`/artists/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        peers.push(data);
        for (const g of data.genres ?? []) {
          const key = g.trim().toLowerCase();
          if (!key) continue;
          genreCounts.set(key, (genreCounts.get(key) ?? 0) + 1);
        }
      } catch {
        void 0;
      }
    }

    const genres = [...genreCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([g]) => g)
      .slice(0, 3);

    return { peers, genres };
  }

  private async inferPeersFromAlbums(
    token: string,
    artistId: string,
  ): Promise<{ peers: SpotifyArtist[]; genres: string[] }> {
    const peerIds = new Set<string>();
    const genreCounts = new Map<string, number>();

    try {
      const { data: albumsData } = await this.api.get<{
        items?: Array<{ id?: string; artists?: Array<{ id?: string }> }>;
      }>(`/artists/${artistId}/albums`, {
        params: { include_groups: 'album,single,appears_on', limit: 10 },
        headers: { Authorization: `Bearer ${token}` },
      });

      for (const album of albumsData.items ?? []) {
        for (const a of album.artists ?? []) {
          if (a.id && a.id !== artistId) peerIds.add(a.id);
        }
        if (!album.id || peerIds.size >= 20) continue;
        try {
          const { data: tracksData } = await this.api.get<{
            items?: Array<{ artists?: Array<{ id?: string }> }>;
          }>(`/albums/${album.id}/tracks`, {
            params: { limit: 20 },
            headers: { Authorization: `Bearer ${token}` },
          });
          for (const track of tracksData.items ?? []) {
            for (const a of track.artists ?? []) {
              if (a.id && a.id !== artistId) peerIds.add(a.id);
            }
          }
        } catch {
          void 0;
        }
        if (peerIds.size >= 20) break;
      }
    } catch {
      return { peers: [], genres: [] };
    }

    const peers: SpotifyArtist[] = [];
    for (const id of [...peerIds].slice(0, 12)) {
      try {
        const { data } = await this.api.get<SpotifyArtist>(`/artists/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        peers.push(data);
        for (const g of data.genres ?? []) {
          const key = g.trim().toLowerCase();
          if (!key) continue;
          genreCounts.set(key, (genreCounts.get(key) ?? 0) + 1);
        }
      } catch {
        void 0;
      }
    }

    const genres = [...genreCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([g]) => g)
      .slice(0, 3);

    return { peers, genres };
  }

  async getTopTracks(artistId: string, limit = 20): Promise<Track[]> {
    const token = await this.requireAccessToken();
    const target = Math.min(Math.max(limit, 1), 20);

    try {
      const cached = artistByIdCache.get(artistId);
      let artistName: string;
      if (cached && cached.expiresAt > Date.now()) {
        artistName = cached.artist.name;
      } else {
        const { data: artist } = await this.api.get<SpotifyArtist>(
          `/artists/${artistId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        cacheArtist(this.mapArtist(artist));
        artistName = artist.name;
      }

      const fromSearch = await this.searchTracksForArtist(
        token,
        artistId,
        artistName,
        target,
      );
      fromSearch.sort((a, b) => b.popularity - a.popularity);
      return fromSearch.slice(0, target);
    } catch (error) {
      throw this.toSpotifyError(`getTopTracks(${artistId})`, error);
    }
  }

  async createPlaylist(
    input: CreateProviderPlaylistInput,
  ): Promise<ProviderPlaylist> {
    const token = await this.requireAccessToken();

    try {
      const { data } = await this.api.post<{
        id: string;
        external_urls: { spotify: string };
      }>(
        '/me/playlists',
        {
          name: input.name,
          description: input.description,
          public: input.isPublic ?? false,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      return {
        id: data.id,
        url: data.external_urls.spotify,
      };
    } catch (error) {
      throw this.toSpotifyError('createPlaylist', error);
    }
  }

  async addTracksToPlaylist(
    playlistId: string,
    trackUris: string[],
  ): Promise<void> {
    const token = await this.requireAccessToken();
    const chunkSize = 100;

    try {
      for (let i = 0; i < trackUris.length; i += chunkSize) {
        const chunk = trackUris.slice(i, i + chunkSize);
        await this.api.post(
          `/playlists/${playlistId}/items`,
          { uris: chunk },
          { headers: { Authorization: `Bearer ${token}` } },
        );
      }
    } catch (error) {
      throw this.toSpotifyError('addTracksToPlaylist', error);
    }
  }

  async uploadPlaylistCover(
    playlistId: string,
    jpegBase64: string,
  ): Promise<void> {
    const token = await this.requireAccessToken();
    const cleaned = jpegBase64.replace(/^data:image\/jpeg;base64,/i, '').trim();
    const bytes = Buffer.from(cleaned, 'base64');
    if (bytes.length === 0) {
      throw new Error('Cover image is empty');
    }
    if (bytes.length > 256 * 1024) {
      throw new Error('Cover image exceeds Spotify 256 KB limit');
    }

    try {
      await this.api.put(`/playlists/${playlistId}/images`, cleaned, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'image/jpeg',
        },
        transformRequest: [(data: string) => data],
      });
    } catch (error) {
      throw this.toSpotifyError('uploadPlaylistCover', error);
    }
  }

  async getPlaylistSnapshot(playlistId: string): Promise<{
    id: string;
    name: string;
    url: string;
    trackCount: number;
    totalDurationMs: number;
    imageUrl?: string;
  } | null> {
    const token = await this.requireAccessToken();

    try {
      const { data } = await this.api.get<{
        id: string;
        name: string;
        external_urls?: { spotify?: string };
        images?: SpotifyImage[];
        tracks?: { total?: number };
        items?: { total?: number };
      }>(`/playlists/${playlistId}`, {
        params: {
          fields: 'id,name,external_urls,images,tracks.total,items.total',
        },
        headers: { Authorization: `Bearer ${token}` },
      });

      const trackCount = data.items?.total ?? data.tracks?.total ?? 0;

      return {
        id: data.id,
        name: data.name,
        url:
          data.external_urls?.spotify ??
          `https://open.spotify.com/playlist/${data.id}`,
        trackCount,
        totalDurationMs: 0,
        imageUrl: data.images?.[0]?.url,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 404 || status === 403) {
          return null;
        }
      }
      throw this.toSpotifyError(`getPlaylistSnapshot(${playlistId})`, error);
    }
  }

  private async sumPlaylistDurationMs(
    token: string,
    playlistId: string,
    expectedTotal: number,
  ): Promise<{ durationMs: number; countedTracks: number }> {
    let offset = 0;
    let durationMs = 0;
    let countedTracks = 0;
    const pageSize = 50;
    const maxPages = 40;
    const endpoints = [
      `/playlists/${playlistId}/items`,
      `/playlists/${playlistId}/tracks`,
    ];

    for (const endpoint of endpoints) {
      offset = 0;
      durationMs = 0;
      countedTracks = 0;
      let endpointOk = false;

      for (let page = 0; page < maxPages; page++) {
        try {
          const { data } = await this.api.get<{
            items?: Array<{
              item?: { duration_ms?: number; type?: string };
              track?: { duration_ms?: number; type?: string } | null;
            }>;
            total?: number;
          }>(endpoint, {
            params: { limit: pageSize, offset },
            headers: { Authorization: `Bearer ${token}` },
          });

          endpointOk = true;
          const items = data.items ?? [];
          for (const entry of items) {
            const piece = entry.item ?? entry.track;
            if (!piece) continue;
            if (piece.type && piece.type !== 'track') continue;
            const ms = piece.duration_ms ?? 0;
            countedTracks += 1;
            if (ms > 0) durationMs += ms;
          }

          offset += items.length;
          const total = data.total ?? expectedTotal ?? offset;
          if (items.length === 0 || offset >= total) {
            break;
          }
        } catch (error) {
          if (endpointOk) {
            this.logger.warn(
              `Duration page failed for ${playlistId} via ${endpoint}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
          break;
        }
      }

      if (endpointOk) {
        return { durationMs, countedTracks };
      }
    }

    return { durationMs: 0, countedTracks: 0 };
  }

  async updatePlaylistDetails(
    playlistId: string,
    details: { name?: string; description?: string; isPublic?: boolean },
  ): Promise<void> {
    const token = await this.requireAccessToken();
    const body: Record<string, string | boolean> = {};
    if (details.name !== undefined) body.name = details.name;
    if (details.description !== undefined) {
      body.description = details.description;
    }
    if (details.isPublic !== undefined) body.public = details.isPublic;
    if (Object.keys(body).length === 0) return;

    try {
      await this.api.put(`/playlists/${playlistId}`, body, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      throw this.toSpotifyError(`updatePlaylistDetails(${playlistId})`, error);
    }
  }

  async deletePlaylist(playlistId: string): Promise<void> {
    const token = await this.requireAccessToken();
    const headers = { Authorization: `Bearer ${token}` };
    const uri = `spotify:playlist:${playlistId}`;

    let cleared = false;
    for (const endpoint of [
      `/playlists/${playlistId}/items`,
      `/playlists/${playlistId}/tracks`,
    ]) {
      try {
        await this.api.put(
          endpoint,
          { uris: [] },
          {
            headers: {
              ...headers,
              'Content-Type': 'application/json',
            },
          },
        );
        cleared = true;
        break;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 429) {
          throw this.toSpotifyError(`deletePlaylist(${playlistId})`, error);
        }
      }
    }

    if (!cleared) {
      this.logger.warn(
        `Could not empty playlist ${playlistId} — still attempting unfollow`,
      );
    }

    try {
      await this.api.put(
        `/playlists/${playlistId}`,
        {
          name: 'Deleted',
          public: false,
          collaborative: false,
          description: '',
        },
        { headers },
      );
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        throw this.toSpotifyError(`deletePlaylist(${playlistId})`, error);
      }
      this.logger.warn(
        `Could not privatize playlist ${playlistId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    try {
      await this.api.delete('/me/library', {
        params: { uris: uri },
        headers,
      });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        throw this.toSpotifyError(`deletePlaylist(${playlistId})`, error);
      }
      try {
        await this.api.delete(`/playlists/${playlistId}/followers`, {
          headers,
        });
      } catch (followError) {
        if (
          axios.isAxiosError(followError) &&
          followError.response?.status === 429
        ) {
          throw this.toSpotifyError(
            `deletePlaylist(${playlistId})`,
            followError,
          );
        }
        this.logger.warn(
          `Playlist ${playlistId} unfollow failed: ${
            followError instanceof Error
              ? followError.message
              : String(followError)
          }`,
        );
      }
    }
  }

  private async clearPlaylistItems(
    playlistId: string,
    token: string,
  ): Promise<void> {
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    for (const endpoint of [
      `/playlists/${playlistId}/items`,
      `/playlists/${playlistId}/tracks`,
    ]) {
      try {
        await this.api.put(endpoint, { uris: [] }, { headers });
        return;
      } catch {
        void 0;
      }
    }

    const uris = await this.listPlaylistItemUris(playlistId, token);
    if (uris.length === 0) return;

    const chunkSize = 100;
    for (let i = 0; i < uris.length; i += chunkSize) {
      const chunk = uris.slice(i, i + chunkSize).map((u) => ({ uri: u }));
      let deleted = false;
      for (const endpoint of [
        `/playlists/${playlistId}/items`,
        `/playlists/${playlistId}/tracks`,
      ]) {
        try {
          await this.api.delete(endpoint, {
            headers,
            data: endpoint.endsWith('/items')
              ? { items: chunk }
              : { tracks: chunk },
          });
          deleted = true;
          break;
        } catch {
          void 0;
        }
      }
      if (!deleted) {
        throw new Error(
          `clearPlaylistItems(${playlistId}): failed removing tracks batch @${i}`,
        );
      }
    }
  }

  private async listPlaylistItemUris(
    playlistId: string,
    token: string,
  ): Promise<string[]> {
    const uris: string[] = [];
    let offset = 0;
    const limit = 50;
    const maxPages = 40;
    const headers = { Authorization: `Bearer ${token}` };

    for (const endpoint of [
      `/playlists/${playlistId}/items`,
      `/playlists/${playlistId}/tracks`,
    ]) {
      uris.length = 0;
      offset = 0;
      let ok = false;

      for (let page = 0; page < maxPages; page++) {
        try {
          const { data } = await this.api.get<{
            items?: Array<{
              uri?: string;
              item?: { uri?: string };
              track?: { uri?: string } | null;
            }>;
            total?: number;
          }>(endpoint, {
            params: { limit, offset },
            headers,
          });
          ok = true;
          const items = data.items ?? [];
          for (const entry of items) {
            const uri =
              entry.item?.uri ?? entry.track?.uri ?? entry.uri ?? undefined;
            if (uri) uris.push(uri);
          }
          offset += items.length;
          if (items.length === 0 || offset >= (data.total ?? offset)) break;
        } catch {
          break;
        }
      }

      if (ok) return uris;
    }

    return uris;
  }

  async listLibraryPlaylistIds(): Promise<Set<string>> {
    const token = await this.requireAccessToken();
    const ids = new Set<string>();
    let offset = 0;
    const limit = 50;
    const maxPages = 2;

    for (let page = 0; page < maxPages; page++) {
      const { data } = await this.api.get<{
        items?: Array<{ id?: string } | null>;
        next?: string | null;
        total?: number;
      }>('/me/playlists', {
        params: { limit, offset },
        headers: { Authorization: `Bearer ${token}` },
      });

      for (const item of data.items ?? []) {
        if (item?.id) ids.add(item.id);
      }

      offset += limit;
      if (!data.next || (data.items?.length ?? 0) === 0) {
        break;
      }
      if (typeof data.total === 'number' && offset >= data.total) {
        break;
      }
    }

    return ids;
  }

  async listPlaybackDevices(): Promise<
    Array<{ id: string; name: string; type: string; isActive: boolean }>
  > {
    const token = await this.requireAccessToken();
    try {
      return await this.fetchPlaybackDevices(token);
    } catch (error) {
      throw this.toPlaybackError('listPlaybackDevices', error);
    }
  }

  async startPlayback(input: {
    contextUri?: string;
    uris?: string[];
    offsetUri?: string;
    deviceId?: string;
  }): Promise<void> {
    const token = await this.requireAccessToken();
    const body: Record<string, unknown> = {};
    if (input.contextUri) body.context_uri = input.contextUri;
    if (input.uris?.length) body.uris = input.uris;
    if (input.offsetUri) body.offset = { uri: input.offsetUri };

    if (!body.context_uri && !body.uris) {
      throw new BusinessRuleError(
        'Playback requires a playlist context or track URIs.',
        'PLAYBACK_INVALID',
      );
    }

    const deviceId =
      input.deviceId?.trim() || (await this.resolvePlaybackDeviceId(token));

    try {
      await this.putPlay(token, body, deviceId);
    } catch (error) {
      if (this.isNoActiveDeviceError(error) && deviceId) {
        try {
          await this.transferPlayback(token, deviceId, false);
          await this.putPlay(token, body, deviceId);
          return;
        } catch (retryError) {
          throw this.toPlaybackError('startPlayback', retryError);
        }
      }
      throw this.toPlaybackError('startPlayback', error);
    }
  }

  private async resolvePlaybackDeviceId(token: string): Promise<string> {
    const devices = await this.fetchPlaybackDevices(token);
    if (devices.length === 0) {
      throw new BusinessRuleError(
        'No active Spotify device. Open Spotify on your phone or computer, play anything once, then try again.',
        'NO_ACTIVE_DEVICE',
      );
    }
    const active = devices.find((d) => d.isActive);
    return active?.id ?? devices[0].id;
  }

  private async fetchPlaybackDevices(
    token: string,
  ): Promise<
    Array<{ id: string; name: string; type: string; isActive: boolean }>
  > {
    const { data } = await this.api.get<{
      devices?: Array<{
        id: string | null;
        name: string;
        type: string;
        is_active: boolean;
      }>;
    }>('/me/player/devices', {
      headers: { Authorization: `Bearer ${token}` },
    });

    return (data.devices ?? [])
      .filter((d): d is typeof d & { id: string } => Boolean(d.id))
      .map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        isActive: d.is_active,
      }));
  }

  private async putPlay(
    token: string,
    body: Record<string, unknown>,
    deviceId?: string,
  ): Promise<void> {
    await this.api.put('/me/player/play', body, {
      headers: { Authorization: `Bearer ${token}` },
      params: deviceId ? { device_id: deviceId } : undefined,
      validateStatus: (status) => status === 204 || status === 200,
    });
  }

  private async transferPlayback(
    token: string,
    deviceId: string,
    play: boolean,
  ): Promise<void> {
    await this.api.put(
      '/me/player',
      { device_ids: [deviceId], play },
      {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: (status) => status === 204 || status === 200,
      },
    );
  }

  private isNoActiveDeviceError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return false;
    const ax = error as AxiosError<{
      error?: { message?: string; reason?: string };
    }>;
    const reason = ax.response?.data?.error?.reason ?? '';
    const message = ax.response?.data?.error?.message ?? '';
    return reason === 'NO_ACTIVE_DEVICE' || /no active device/i.test(message);
  }

  async getCurrentUser(): Promise<User> {
    const token = await this.requireAccessToken();
    try {
      const { data } = await this.api.get<{
        id: string;
        display_name: string;
        email?: string;
        images?: SpotifyImage[];
      }>('/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      return User.create({
        id: this.userId ?? randomUUID(),
        spotifyId: data.id,
        displayName: data.display_name || data.id,
        email: data.email,
        imageUrl: data.images?.[0]?.url,
      });
    } catch (error) {
      throw this.toSpotifyError('getCurrentUser', error);
    }
  }

  private async searchTracksForArtist(
    token: string,
    artistId: string,
    artistName: string,
    limit: number,
  ): Promise<Track[]> {
    const collected: Track[] = [];
    const seen = new Set<string>();
    const pageSize = 10;

    const { data } = await this.api.get<{
      tracks: { items: SpotifyTrack[] };
    }>('/search', {
      params: {
        q: `artist:"${artistName}"`,
        type: 'track',
        limit: pageSize,
        offset: 0,
      },
      headers: { Authorization: `Bearer ${token}` },
    });

    for (const item of data.tracks?.items ?? []) {
      if (!item?.id || seen.has(item.id)) continue;
      const isPrimary = item.artists?.some((a) => a.id === artistId);
      if (!isPrimary) continue;
      seen.add(item.id);
      collected.push(this.mapTrack(item, artistId, artistName));
      if (collected.length >= limit) break;
    }

    return collected;
  }

  private async tracksFromAlbums(
    token: string,
    artistId: string,
    artistName: string,
    needed: number,
    alreadyHave: Set<string>,
  ): Promise<Track[]> {
    if (needed <= 0) return [];

    const { data: albumsData } = await this.api.get<{
      items: SpotifyAlbumSummary[];
    }>(`/artists/${artistId}/albums`, {
      params: {
        include_groups: 'album,single',
        limit: 10,
      },
      headers: { Authorization: `Bearer ${token}` },
    });

    const collected: Track[] = [];

    for (const album of albumsData.items ?? []) {
      if (collected.length >= needed) break;

      const { data: tracksData } = await this.api.get<{
        items: Array<{
          id: string;
          name: string;
          duration_ms: number;
          uri: string;
          artists: { id: string; name: string }[];
        }>;
      }>(`/albums/${album.id}/tracks`, {
        params: { limit: 50 },
        headers: { Authorization: `Bearer ${token}` },
      });

      for (const item of tracksData.items ?? []) {
        if (!item?.id || alreadyHave.has(item.id)) continue;
        const isPrimary = item.artists?.some((a) => a.id === artistId);
        if (!isPrimary) continue;

        alreadyHave.add(item.id);
        collected.push(
          Track.create({
            id: TrackId.create(item.id),
            name: item.name,
            artistId: ArtistId.create(artistId),
            artistName,
            durationMs: item.duration_ms,
            popularity: 0,
            uri: item.uri,
            albumName: album.name,
            albumImageUrl: album.images?.[0]?.url,
          }),
        );

        if (collected.length >= needed) break;
      }
    }

    return collected;
  }

  private mapArtist(item: SpotifyArtist): Artist {
    return Artist.create({
      id: ArtistId.create(item.id),
      name: item.name,
      imageUrl: item.images?.[0]?.url,
    });
  }

  private mapTrack(
    item: SpotifyTrack,
    fallbackArtistId: string,
    fallbackArtistName: string,
  ): Track {
    return Track.create({
      id: TrackId.create(item.id),
      name: item.name,
      artistId: ArtistId.create(item.artists[0]?.id ?? fallbackArtistId),
      artistName: item.artists[0]?.name ?? fallbackArtistName,
      durationMs: item.duration_ms,
      popularity: item.popularity ?? 0,
      uri: item.uri,
      albumName: item.album?.name,
      albumImageUrl: item.album?.images?.[0]?.url,
      previewUrl: item.preview_url ?? undefined,
    });
  }

  private async requireAccessToken(): Promise<string> {
    if (!this.userId) {
      throw new Error('Call forUser(userId) before Spotify API requests');
    }
    return this.tokenService.getValidAccessToken(this.userId);
  }

  private toPlaybackError(operation: string, error: unknown): Error {
    if (axios.isAxiosError(error)) {
      const ax = error as AxiosError<{
        error?: { message?: string; status?: number; reason?: string };
      }>;
      const status = ax.response?.status;
      const reason = ax.response?.data?.error?.reason ?? '';
      const message =
        ax.response?.data?.error?.message ?? ax.message ?? 'Playback failed';

      this.logger.warn(`Spotify ${operation} failed (${status}): ${message}`);

      if (reason === 'NO_ACTIVE_DEVICE' || /no active device/i.test(message)) {
        return new BusinessRuleError(
          'No active Spotify device. Open Spotify on your phone or computer, play anything once, then try again.',
          'NO_ACTIVE_DEVICE',
        );
      }
      if (status === 404) {
        return new BusinessRuleError(
          message || 'Spotify player not available right now.',
          'PLAYBACK_NOT_FOUND',
        );
      }
      if (
        status === 403 ||
        reason === 'PREMIUM_REQUIRED' ||
        /premium/i.test(message)
      ) {
        return new BusinessRuleError(
          'Playing on Spotify devices requires Spotify Premium.',
          'PREMIUM_REQUIRED',
        );
      }
      if (status === 401) {
        return new BusinessRuleError(
          'Spotify session expired or missing playback permission. Log out and back in once.',
          'PLAYBACK_UNAUTHORIZED',
        );
      }
      return new BusinessRuleError(message, 'PLAYBACK_FAILED');
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  private toSpotifyError(operation: string, error: unknown): Error {
    if (axios.isAxiosError(error)) {
      const ax = error as AxiosError<{
        error?: { message?: string; status?: number; reason?: string };
      }>;
      const status = ax.response?.status;
      const reason = ax.response?.data?.error?.reason;
      const message =
        ax.response?.data?.error?.message ??
        ax.message ??
        'Spotify request failed';
      const headers = ax.response?.headers;
      const retryRaw: unknown =
        headers && typeof headers === 'object' && 'retry-after' in headers
          ? (headers as Record<string, unknown>)['retry-after']
          : undefined;
      const retryHeader = (() => {
        if (typeof retryRaw === 'string') return retryRaw;
        if (typeof retryRaw === 'number') return String(retryRaw);
        if (Array.isArray(retryRaw) && retryRaw.length > 0) {
          const first: unknown = retryRaw[0];
          return typeof first === 'string' || typeof first === 'number'
            ? String(first)
            : undefined;
        }
        return undefined;
      })();

      this.logger.error(
        `Spotify ${operation} failed (${status}${reason ? `/${reason}` : ''}${
          retryHeader ? ` retry-after=${retryHeader}` : ''
        }): ${message}`,
      );

      if (status === 429 || ax.code === 'ERR_SPOTIFY_COOLDOWN') {
        const seconds = Number(retryHeader);
        const retryAfterSeconds =
          Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
        const quotaExceeded = reason === 'QUOTA_EXCEEDED';
        const waitLabel = formatRetryWait(retryAfterSeconds, quotaExceeded);
        const code = quotaExceeded
          ? 'SPOTIFY_QUOTA_EXCEEDED'
          : 'SPOTIFY_RATE_LIMITED';
        return new BusinessRuleError(
          quotaExceeded
            ? `Spotify developer quota exceeded. Wait ${waitLabel} before searching or creating again.`
            : `Spotify rate limit. Wait ${waitLabel} before searching or creating again.`,
          code,
          {
            retryAfterSeconds,
            reason: reason ?? (quotaExceeded ? 'QUOTA_EXCEEDED' : 'rate_limit'),
          },
        );
      }

      return new Error(`Spotify ${operation} failed (${status}): ${message}`);
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}
