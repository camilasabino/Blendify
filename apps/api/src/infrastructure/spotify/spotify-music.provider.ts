import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CatalogProviderFactoryPort,
  CatalogProviderPort,
} from '../../domain/repositories/catalog-provider.port';
import type { MusicProviderFactoryPort } from '../../domain/repositories/music-provider.factory.port';
import type {
  CreateProviderPlaylistInput,
  MusicProviderPort,
  PlaybackDevice,
  PlaylistRemoteSnapshot,
  ProviderPlaylist,
  StartPlaybackInput,
} from '../../domain/repositories/music-provider.port';
import { User } from '../../domain/user/user.entity';
import { SpotifyTokenService } from '../auth/spotify-token.service';
import { RedisCacheService } from '../cache/redis-cache.service';
import { parseConfiguredMarket, resolveCatalogMarket } from './catalog-market';
import { SpotifyApiClient } from './spotify-api.client';
import { SpotifyAppTokenProvider } from './spotify-app-token.provider';
import { SpotifyCatalogClient } from './spotify-catalog.client';
import { SpotifyPlaybackClient } from './spotify-playback.client';
import { SpotifyPlaylistClient } from './spotify-playlist.client';

@Injectable()
export class SpotifyMusicProvider
  implements MusicProviderFactoryPort, CatalogProviderFactoryPort
{
  private readonly api: SpotifyApiClient;
  private readonly configuredMarket: string;

  constructor(
    tokenService: SpotifyTokenService,
    private readonly appTokens: SpotifyAppTokenProvider,
    config: ConfigService,
    @Optional() private readonly cache?: RedisCacheService,
  ) {
    this.api = new SpotifyApiClient(tokenService);
    this.configuredMarket = parseConfiguredMarket(
      config.get<string>('SPOTIFY_CATALOG_MARKET'),
    );
  }

  forUser(userId: string): MusicProviderPort {
    return new SpotifyUserMusicProvider(
      new SpotifyPlaylistClient(userId, this.api),
      new SpotifyPlaybackClient(userId, this.api),
    );
  }

  forMarket(market?: string | null): CatalogProviderPort {
    return new SpotifyCatalogClient(
      this.api,
      this.appTokens,
      resolveCatalogMarket(market, this.configuredMarket),
      this.cache,
    );
  }
}

class SpotifyUserMusicProvider implements MusicProviderPort {
  constructor(
    private readonly playlists: SpotifyPlaylistClient,
    private readonly playback: SpotifyPlaybackClient,
  ) {}

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
