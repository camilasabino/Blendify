import { Artist } from '../artist/artist.entity';
import { Track } from '../track/track.entity';
import { User } from '../user/user.entity';

export const MUSIC_PROVIDER = 'MUSIC_PROVIDER' as const;

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
}

export interface SearchTracksOptions {
  limit?: number;
  offset?: number;
}

export interface MusicProviderPort {
  searchArtists(query: string, limit?: number): Promise<Artist[]>;

  searchTracks(query: string, options?: SearchTracksOptions): Promise<Track[]>;

  getArtistsByIds(ids: string[]): Promise<Artist[]>;

  getSimilarArtists(
    artistId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<{ artists: Artist[]; hasMore: boolean }>;

  getTopTracks(artistId: string, limit?: number): Promise<Track[]>;

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

export type PlaybackDevice = {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
};

export type StartPlaybackInput = {
  contextUri?: string;
  uris?: string[];
  offsetUri?: string;
  deviceId?: string;
};
