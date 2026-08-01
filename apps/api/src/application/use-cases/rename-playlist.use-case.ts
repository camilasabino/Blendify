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
import { toPlaylistDetail } from '../dto/playlist-response.dto';
import type { PlaylistDetail } from '@blendify/contracts';

@Injectable()
export class RenamePlaylistUseCase {
  private readonly logger = new Logger(RenamePlaylistUseCase.name);

  constructor(
    @Inject(PLAYLIST_REPOSITORY)
    private readonly playlists: PlaylistRepositoryPort,
    @Inject(MUSIC_PROVIDER_FACTORY)
    private readonly providers: MusicProviderFactoryPort,
  ) {}

  async execute(
    userId: string,
    playlistId: string,
    name: string,
  ): Promise<PlaylistDetail> {
    const playlist = await this.playlists.findById(playlistId);
    if (!playlist || playlist.userId !== userId) {
      throw BusinessRuleError.playlistNotFound(playlistId);
    }

    playlist.rename(name);

    if (playlist.spotifyId && !playlist.missingOnSpotify) {
      try {
        const provider = this.providers.forUser(userId);
        await provider.updatePlaylistDetails(playlist.spotifyId, { name });
      } catch (error) {
        this.logger.warn(
          `Spotify rename failed for ${playlist.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const saved = await this.playlists.save(playlist);
    return toPlaylistDetail(saved);
  }
}
