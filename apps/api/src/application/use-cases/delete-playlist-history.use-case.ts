import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  MUSIC_PROVIDER,
  MusicProviderPort,
} from '../../domain/repositories/music-provider.port';
import {
  PLAYLIST_REPOSITORY,
  PlaylistRepositoryPort,
} from '../../domain/repositories/playlist.repository.port';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import { SpotifyMusicProvider } from '../../infrastructure/spotify/spotify-music.provider';

@Injectable()
export class DeletePlaylistHistoryUseCase {
  private readonly logger = new Logger(DeletePlaylistHistoryUseCase.name);

  constructor(
    @Inject(PLAYLIST_REPOSITORY)
    private readonly playlists: PlaylistRepositoryPort,
    @Inject(MUSIC_PROVIDER) private readonly music: MusicProviderPort,
  ) {}

  async execute(
    userId: string,
    playlistId: string,
    options: { fromSpotify?: boolean } = {},
  ): Promise<void> {
    const playlist = await this.playlists.findById(playlistId);
    if (!playlist || playlist.userId !== userId) {
      throw BusinessRuleError.playlistNotFound(playlistId);
    }

    if (
      options.fromSpotify &&
      playlist.spotifyId &&
      !playlist.missingOnSpotify
    ) {
      const provider = this.bind(userId);
      try {
        await provider.deletePlaylist(playlist.spotifyId);
      } catch (error) {
        this.logger.error(
          `Spotify purge failed for ${playlist.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        throw error;
      }
      playlist.markMissingOnSpotify();
      await this.playlists.save(playlist);
      return;
    }

    await this.playlists.delete(playlistId);
  }

  private bind(userId: string): MusicProviderPort {
    if (this.music instanceof SpotifyMusicProvider) {
      return this.music.forUser(userId);
    }
    return this.music;
  }
}
