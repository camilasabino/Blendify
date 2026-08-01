import { Injectable, Optional } from '@nestjs/common';
import { Artist } from '../../domain/artist/artist.entity';
import type { MusicProviderFactoryPort } from '../../domain/repositories/music-provider.factory.port';
import type {
  CreateProviderPlaylistInput,
  MusicProviderPort,
  PlaybackDevice,
  PlaylistRemoteSnapshot,
  ProviderPlaylist,
  ResolveTrackOptions,
  SearchTracksOptions,
  StartPlaybackInput,
} from '../../domain/repositories/music-provider.port';
import { Track } from '../../domain/track/track.entity';
import { User } from '../../domain/user/user.entity';
import { SpotifyTokenService } from '../auth/spotify-token.service';
import { RedisCacheService } from '../cache/redis-cache.service';
import { SpotifyApiClient } from './spotify-api.client';
import { SpotifyCatalogClient } from './spotify-catalog.client';
import { SpotifyPlaybackClient } from './spotify-playback.client';
import { SpotifyPlaylistClient } from './spotify-playlist.client';

@Injectable()
export class SpotifyMusicProvider
  implements MusicProviderPort, MusicProviderFactoryPort
{
  private userId: string | null = null;
  private api: SpotifyApiClient;
  private catalog: SpotifyCatalogClient;
  private playlists: SpotifyPlaylistClient;
  private playback: SpotifyPlaybackClient;

  constructor(
    tokenService: SpotifyTokenService,
    @Optional() private cache?: RedisCacheService,
  ) {
    this.api = new SpotifyApiClient(tokenService);
    this.catalog = new SpotifyCatalogClient(this.userId, this.api, this.cache);
    this.playlists = new SpotifyPlaylistClient(this.userId, this.api);
    this.playback = new SpotifyPlaybackClient(this.userId, this.api);
  }

  forUser(userId: string): MusicProviderPort {
    const bound = Object.create(
      SpotifyMusicProvider.prototype,
    ) as SpotifyMusicProvider;
    bound.userId = userId;
    bound.api = this.api;
    bound.cache = this.cache;
    bound.catalog = new SpotifyCatalogClient(userId, this.api, this.cache);
    bound.playlists = new SpotifyPlaylistClient(userId, this.api);
    bound.playback = new SpotifyPlaybackClient(userId, this.api);
    return bound;
  }

  searchArtists(query: string, limit?: number): Promise<Artist[]> {
    return this.catalog.searchArtists(query, limit);
  }

  searchTracks(query: string, options?: SearchTracksOptions): Promise<Track[]> {
    return this.catalog.searchTracks(query, options);
  }

  resolveTrack(
    artistName: string,
    trackName: string,
    options?: ResolveTrackOptions,
  ): Promise<Track | null> {
    return this.catalog.resolveTrack(artistName, trackName, options);
  }

  getArtistsByIds(ids: string[]): Promise<Artist[]> {
    return this.catalog.getArtistsByIds(ids);
  }

  createPlaylist(
    input: CreateProviderPlaylistInput,
  ): Promise<ProviderPlaylist> {
    return this.playlists.createPlaylist(input);
  }

  addTracksToPlaylist(playlistId: string, trackUris: string[]): Promise<void> {
    return this.playlists.addTracksToPlaylist(playlistId, trackUris);
  }

  uploadPlaylistCover(playlistId: string, jpegBase64: string): Promise<void> {
    return this.playlists.uploadPlaylistCover(playlistId, jpegBase64);
  }

  getPlaylistSnapshot(
    playlistId: string,
  ): Promise<PlaylistRemoteSnapshot | null> {
    return this.playlists.getPlaylistSnapshot(playlistId);
  }

  listLibraryPlaylistIds(): Promise<Set<string>> {
    return this.playlists.listLibraryPlaylistIds();
  }

  updatePlaylistDetails(
    playlistId: string,
    details: { name?: string; description?: string; isPublic?: boolean },
  ): Promise<void> {
    return this.playlists.updatePlaylistDetails(playlistId, details);
  }

  deletePlaylist(playlistId: string): Promise<void> {
    return this.playlists.deletePlaylist(playlistId);
  }

  listPlaybackDevices(): Promise<PlaybackDevice[]> {
    return this.playback.listPlaybackDevices();
  }

  startPlayback(input: StartPlaybackInput): Promise<void> {
    return this.playback.startPlayback(input);
  }

  getCurrentUser(): Promise<User> {
    return this.playlists.getCurrentUser();
  }
}
