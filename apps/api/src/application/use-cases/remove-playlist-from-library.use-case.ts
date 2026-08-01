import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  MUSIC_PROVIDER_FACTORY,
  type MusicProviderFactoryPort,
} from '../../domain/repositories/music-provider.factory.port';
import {
  PLAYLIST_REPOSITORY,
  PlaylistRepositoryPort,
} from '../../domain/repositories/playlist.repository.port';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';

@Injectable()
export class RemovePlaylistFromLibraryUseCase {
  private readonly logger = new Logger(RemovePlaylistFromLibraryUseCase.name);

  constructor(
    @Inject(PLAYLIST_REPOSITORY)
    private readonly playlists: PlaylistRepositoryPort,
    @Inject(MUSIC_PROVIDER_FACTORY)
    private readonly providers: MusicProviderFactoryPort,
  ) {}

  async execute(
    userId: string,
    playlistId: string,
    options: { fromSpotify?: boolean } = {},
  ): Promise<void> {
    const playlist = await this.playlists.findById(playlistId);
    if (playlist?.userId !== userId) {
      throw BusinessRuleError.playlistNotFound(playlistId);
    }

    if (
      options.fromSpotify &&
      playlist.spotifyId &&
      !playlist.missingOnSpotify
    ) {
      const provider = this.providers.forUser(userId);
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
}
