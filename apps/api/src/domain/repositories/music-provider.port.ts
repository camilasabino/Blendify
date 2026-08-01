import { Artist } from '../artist/artist.entity';
import { Track } from '../track/track.entity';
import { User } from '../user/user.entity';
import type {
  PlaybackDeviceDto,
  StartPlaybackRequest,
} from '@blendify/contracts';

export interface CreateProviderPlaylistInput {
  userId: string;
  name: string;
  description: string;
  isPublic?: boolean;
}

export interface ProviderPlaylist {
  id: string;
  url: string;
}

export interface PlaylistRemoteSnapshot {
  id: string;
  name: string;
  url: string;
  trackCount: number;
  totalDurationMs: number;
  imageUrl?: string;
  /** Present when items were fetched from Spotify; omit to leave stored tracks unchanged. */
  tracks?: Track[];
}

export interface SearchTracksOptions {
  limit?: number;
  offset?: number;
}

export interface ResolveTrackOptions {
  /** When set, only accept Spotify tracks that include this artist. */
  artistId?: string;
}

export interface MusicProviderPort {
  searchArtists(query: string, limit?: number): Promise<Artist[]>;

  searchTracks(query: string, options?: SearchTracksOptions): Promise<Track[]>;

  /**
   * Resolve a specific artist+track title to a Spotify track (precise search).
   * Preferred over paginated artist search for catalog charts from Last.fm.
   */
  resolveTrack(
    artistName: string,
    trackName: string,
    options?: ResolveTrackOptions,
  ): Promise<Track | null>;

  getArtistsByIds(ids: string[]): Promise<Artist[]>;

  createPlaylist(input: CreateProviderPlaylistInput): Promise<ProviderPlaylist>;

  addTracksToPlaylist(playlistId: string, trackUris: string[]): Promise<void>;

  uploadPlaylistCover(playlistId: string, jpegBase64: string): Promise<void>;

  getPlaylistSnapshot(
    playlistId: string,
  ): Promise<PlaylistRemoteSnapshot | null>;

  listLibraryPlaylistIds(): Promise<Set<string>>;

  updatePlaylistDetails(
    playlistId: string,
    details: { name?: string; description?: string; isPublic?: boolean },
  ): Promise<void>;

  deletePlaylist(playlistId: string): Promise<void>;

  listPlaybackDevices(): Promise<PlaybackDevice[]>;

  startPlayback(input: StartPlaybackInput): Promise<void>;

  getCurrentUser(accessToken?: string): Promise<User>;
}

export type PlaybackDevice = PlaybackDeviceDto;
export type StartPlaybackInput = StartPlaybackRequest;
