import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MAX_TRACKS } from '../../domain/constants';
import {
  CreateProviderPlaylistInput,
  PlaylistRemoteSnapshot,
  ProviderPlaylist,
} from '../../domain/repositories/music-provider.port';
import { Track } from '../../domain/track/track.entity';
import { User } from '../../domain/user/user.entity';
import { ArtistId } from '../../domain/value-objects/artist-id.vo';
import { TrackId } from '../../domain/value-objects/track-id.vo';
import { SpotifyApiClient } from './spotify-api.client';

interface SpotifyImage {
  url: string;
}

interface SpotifyPlaylistTrack {
  id?: string;
  name?: string;
  uri?: string;
  duration_ms?: number;
  popularity?: number;
  preview_url?: string | null;
  artists?: Array<{ id?: string; name?: string }>;
  album?: { name?: string; images?: SpotifyImage[] };
  external_ids?: { isrc?: string | null };
  external_urls?: { spotify?: string | null };
}

export class SpotifyPlaylistClient {
  private readonly logger = new Logger(SpotifyPlaylistClient.name);

  constructor(
    private readonly userId: string | null,
    private readonly api: SpotifyApiClient,
  ) {}

  async createPlaylist(
    input: CreateProviderPlaylistInput,
  ): Promise<ProviderPlaylist> {
    const token = await this.api.accessToken(this.userId);
    const data = await this.api.request<{
      id: string;
      external_urls: { spotify: string };
    }>('createPlaylist', token, {
      method: 'POST',
      url: '/me/playlists',
      data: {
        name: input.name,
        description: input.description,
        public: input.isPublic ?? false,
      },
    });
    return { id: data.id, url: data.external_urls.spotify };
  }

  async addTracksToPlaylist(
    playlistId: string,
    trackUris: string[],
  ): Promise<void> {
    const token = await this.api.accessToken(this.userId);
    const chunkSize = 100;

    for (let i = 0; i < trackUris.length; i += chunkSize) {
      await this.api.request<unknown>('addTracksToPlaylist', token, {
        method: 'POST',
        url: `/playlists/${playlistId}/items`,
        data: { uris: trackUris.slice(i, i + chunkSize) },
      });
    }
  }

  async uploadPlaylistCover(
    playlistId: string,
    jpegBase64: string,
  ): Promise<void> {
    const token = await this.api.accessToken(this.userId);
    const cleaned = jpegBase64.replace(/^data:image\/jpeg;base64,/i, '').trim();
    const bytes = Buffer.from(cleaned, 'base64');
    if (bytes.length === 0) throw new Error('Cover image is empty');
    if (bytes.length > 256 * 1024) {
      throw new Error('Cover image exceeds Spotify 256 KB limit');
    }

    await this.api.request<unknown>('uploadPlaylistCover', token, {
      method: 'PUT',
      url: `/playlists/${playlistId}/images`,
      data: cleaned,
      headers: { 'Content-Type': 'image/jpeg' },
      transformRequest: [(data: string) => data],
    });
  }

  async getPlaylistSnapshot(
    playlistId: string,
  ): Promise<PlaylistRemoteSnapshot | null> {
    const token = await this.api.accessToken(this.userId);
    try {
      const { data } = await this.api.raw<{
        id: string;
        name: string;
        external_urls?: { spotify?: string };
        images?: SpotifyImage[];
        tracks?: { total?: number };
        items?: { total?: number };
      }>(token, {
        method: 'GET',
        url: `/playlists/${playlistId}`,
        params: {
          fields: 'id,name,external_urls,images,tracks.total,items.total',
        },
      });

      const metaTrackCount = data.items?.total ?? data.tracks?.total ?? 0;
      const items = await this.fetchPlaylistItems(token, playlistId);
      const trackCount = items.total ?? metaTrackCount;
      const fromTracks = items.tracks.reduce(
        (sum, track) => sum + track.durationMs,
        0,
      );
      const totalDurationMs =
        items.totalDurationMs > 0 ? items.totalDurationMs : fromTracks;

      // Never wipe stored tracks with an empty fetch when Spotify still has items.
      const applyTracks =
        items.fetched && (items.tracks.length > 0 || trackCount === 0);

      return {
        id: data.id,
        name: data.name,
        url:
          data.external_urls?.spotify ??
          `https://open.spotify.com/playlist/${data.id}`,
        trackCount,
        totalDurationMs:
          applyTracks || totalDurationMs > 0 ? totalDurationMs : 0,
        imageUrl: data.images?.[0]?.url,
        tracks: applyTracks ? items.tracks.slice(0, MAX_TRACKS) : undefined,
      };
    } catch (error) {
      if (this.api.isStatus(error, 403, 404)) return null;
      throw this.api.toSpotifyError(
        `getPlaylistSnapshot(${playlistId})`,
        error,
      );
    }
  }

  private async fetchPlaylistItems(
    token: string,
    playlistId: string,
  ): Promise<{
    fetched: boolean;
    tracks: Track[];
    total?: number;
    totalDurationMs: number;
  }> {
    const tracks: Track[] = [];
    let totalDurationMs = 0;
    let offset = 0;
    const limit = 50;
    let total: number | undefined;
    let fetched = false;

    try {
      while (true) {
        const page = await this.fetchPlaylistItemsPage(
          token,
          playlistId,
          limit,
          offset,
        );
        fetched = true;
        if (typeof page.total === 'number') total = page.total;

        const mapped = appendMappedPlaylistTracks(page.items, tracks);
        totalDurationMs += mapped.addedDurationMs;

        offset += limit;
        if (!page.next || page.items.length === 0) break;
        if (typeof total === 'number' && offset >= total) break;
        // Bound pagination for very large playlists during library sync.
        if (offset >= 200) break;
      }

      if (fetched && tracks.length === 0 && (total ?? 0) > 0) {
        this.logger.warn(
          `Playlist ${playlistId} items fetched but none mapped (${total} reported)`,
        );
      }

      return { fetched, tracks, total, totalDurationMs };
    } catch (error) {
      if (this.api.isStatus(error, 403, 404)) {
        this.logger.warn(
          `Could not fetch items for playlist ${playlistId}: ${errorMessage(error)}`,
        );
        return { fetched: false, tracks: [], totalDurationMs: 0 };
      }
      throw this.api.toSpotifyError(`fetchPlaylistItems(${playlistId})`, error);
    }
  }

  private async fetchPlaylistItemsPage(
    token: string,
    playlistId: string,
    limit: number,
    offset: number,
  ): Promise<{
    items: Array<{
      track?: SpotifyPlaylistTrack | null;
      item?: SpotifyPlaylistTrack | null;
    } | null>;
    total?: number;
    next?: string | null;
  }> {
    // Avoid aggressive `fields` filtering — Spotify often returns stubs
    // that omit uri/duration and we would wipe the local track list.
    const { data } = await this.api.raw<{
      items?: Array<{
        track?: SpotifyPlaylistTrack | null;
        item?: SpotifyPlaylistTrack | null;
      } | null>;
      total?: number;
      next?: string | null;
    }>(token, {
      method: 'GET',
      url: `/playlists/${playlistId}/items`,
      params: {
        limit,
        offset,
        additional_types: 'track',
      },
    });
    return {
      items: data.items ?? [],
      total: data.total,
      next: data.next,
    };
  }

  async updatePlaylistDetails(
    playlistId: string,
    details: { name?: string; description?: string; isPublic?: boolean },
  ): Promise<void> {
    const token = await this.api.accessToken(this.userId);
    const body: Record<string, string | boolean> = {};
    if (details.name !== undefined) body.name = details.name;
    if (details.description !== undefined) {
      body.description = details.description;
    }
    if (details.isPublic !== undefined) body.public = details.isPublic;
    if (Object.keys(body).length === 0) return;

    await this.api.request<unknown>(
      `updatePlaylistDetails(${playlistId})`,
      token,
      {
        method: 'PUT',
        url: `/playlists/${playlistId}`,
        data: body,
      },
    );
  }

  async deletePlaylist(playlistId: string): Promise<void> {
    const token = await this.api.accessToken(this.userId);
    const uri = `spotify:playlist:${playlistId}`;

    const cleared = await this.clearPlaylistItems(token, playlistId);
    if (!cleared) {
      this.logger.warn(
        `Could not empty playlist ${playlistId} — still attempting unfollow`,
      );
    }

    await this.privatizeDeletedPlaylist(token, playlistId);
    await this.unfollowPlaylist(token, playlistId, uri);
  }

  private async clearPlaylistItems(
    token: string,
    playlistId: string,
  ): Promise<boolean> {
    for (const endpoint of [
      `/playlists/${playlistId}/items`,
      `/playlists/${playlistId}/tracks`,
    ]) {
      try {
        await this.api.raw(token, {
          method: 'PUT',
          url: endpoint,
          data: { uris: [] },
          headers: { 'Content-Type': 'application/json' },
        });
        return true;
      } catch (error) {
        if (this.api.isStatus(error, 429)) {
          throw this.api.toSpotifyError(`deletePlaylist(${playlistId})`, error);
        }
      }
    }
    return false;
  }

  private async privatizeDeletedPlaylist(
    token: string,
    playlistId: string,
  ): Promise<void> {
    try {
      await this.api.raw(token, {
        method: 'PUT',
        url: `/playlists/${playlistId}`,
        data: {
          name: 'Deleted',
          public: false,
          collaborative: false,
          description: '',
        },
      });
    } catch (error) {
      if (this.api.isStatus(error, 429)) {
        throw this.api.toSpotifyError(`deletePlaylist(${playlistId})`, error);
      }
      this.logger.warn(
        `Could not privatize playlist ${playlistId}: ${errorMessage(error)}`,
      );
    }
  }

  private async unfollowPlaylist(
    token: string,
    playlistId: string,
    uri: string,
  ): Promise<void> {
    try {
      await this.api.raw(token, {
        method: 'DELETE',
        url: '/me/library',
        params: { uris: uri },
      });
    } catch (error) {
      if (this.api.isStatus(error, 429)) {
        throw this.api.toSpotifyError(`deletePlaylist(${playlistId})`, error);
      }
      await this.unfollowPlaylistFollowers(token, playlistId);
    }
  }

  private async unfollowPlaylistFollowers(
    token: string,
    playlistId: string,
  ): Promise<void> {
    try {
      await this.api.raw(token, {
        method: 'DELETE',
        url: `/playlists/${playlistId}/followers`,
      });
    } catch (followError) {
      if (this.api.isStatus(followError, 429)) {
        throw this.api.toSpotifyError(
          `deletePlaylist(${playlistId})`,
          followError,
        );
      }
      this.logger.warn(
        `Playlist ${playlistId} unfollow failed: ${errorMessage(followError)}`,
      );
    }
  }

  async listLibraryPlaylistIds(): Promise<Set<string>> {
    const token = await this.api.accessToken(this.userId);
    const ids = new Set<string>();
    let offset = 0;
    const limit = 50;
    const maxPages = 2;

    try {
      for (let page = 0; page < maxPages; page++) {
        const data = await this.api.request<{
          items?: Array<{ id?: string } | null>;
          next?: string | null;
          total?: number;
        }>('listLibraryPlaylistIds', token, {
          method: 'GET',
          url: '/me/playlists',
          params: { limit, offset },
        });
        for (const item of data.items ?? []) {
          if (item?.id) ids.add(item.id);
        }
        offset += limit;
        if (!data.next || (data.items?.length ?? 0) === 0) break;
        if (typeof data.total === 'number' && offset >= data.total) break;
      }
      return ids;
    } catch (error) {
      if (this.api.isStatus(error, 403)) {
        this.logger.warn(
          'listLibraryPlaylistIds needs playlist-read-private — re-login after updating SPOTIFY_SCOPES',
        );
        throw error;
      }
      throw error;
    }
  }

  async getCurrentUser(): Promise<User> {
    const token = await this.api.accessToken(this.userId);
    const data = await this.api.request<{
      id: string;
      display_name: string;
      email?: string;
      images?: SpotifyImage[];
    }>('getCurrentUser', token, {
      method: 'GET',
      url: '/me',
    });
    return User.create({
      id: this.userId ?? randomUUID(),
      spotifyId: data.id,
      displayName: data.display_name || data.id,
      email: data.email,
      imageUrl: data.images?.[0]?.url,
    });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function appendMappedPlaylistTracks(
  items: Array<{
    track?: SpotifyPlaylistTrack | null;
    item?: SpotifyPlaylistTrack | null;
  } | null>,
  tracks: Track[],
): { addedDurationMs: number } {
  let addedDurationMs = 0;
  for (const entry of items) {
    // Spotify /items uses `item`; older /tracks responses used `track`.
    const track = mapPlaylistTrack(entry?.item ?? entry?.track);
    if (!track) continue;
    addedDurationMs += track.durationMs;
    if (tracks.length < MAX_TRACKS) tracks.push(track);
  }
  return { addedDurationMs };
}

function mapPlaylistTrack(item?: SpotifyPlaylistTrack | null): Track | null {
  if (!item?.id || !item.uri || !item.name?.trim()) return null;
  const artist = item.artists?.[0];
  return Track.create({
    id: TrackId.create(item.id),
    name: item.name,
    artistId: ArtistId.create(artist?.id ?? 'unknown'),
    artistName: artist?.name?.trim() || 'Unknown Artist',
    durationMs: Math.max(0, item.duration_ms ?? 0),
    popularity: item.popularity ?? 0,
    uri: item.uri,
    albumName: item.album?.name,
    albumImageUrl: item.album?.images?.[0]?.url,
    previewUrl: item.preview_url ?? undefined,
    artists: item.artists?.map((credit) => ({
      id: credit.id,
      name: credit.name ?? '',
    })),
    isrc: item.external_ids?.isrc ?? undefined,
    externalUrl: item.external_urls?.spotify ?? undefined,
  });
}
