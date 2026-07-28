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
import {
  PlaylistResponseDto,
  toPlaylistResponse,
} from '../dto/playlist-response.dto';
import { SpotifyMusicProvider } from '../../infrastructure/spotify/spotify-music.provider';

@Injectable()
export class RenamePlaylistUseCase {
  private readonly logger = new Logger(RenamePlaylistUseCase.name);

  constructor(
    @Inject(PLAYLIST_REPOSITORY)
    private readonly playlists: PlaylistRepositoryPort,
    @Inject(MUSIC_PROVIDER) private readonly music: MusicProviderPort,
  ) {}

  async execute(
    userId: string,
    playlistId: string,
    name: string,
  ): Promise<PlaylistResponseDto> {
    const playlist = await this.playlists.findById(playlistId);
    if (!playlist || playlist.userId !== userId) {
      throw BusinessRuleError.playlistNotFound(playlistId);
    }

    playlist.rename(name);

    if (playlist.spotifyId && !playlist.missingOnSpotify) {
      try {
        const provider = this.bind(userId);
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
    return toPlaylistResponse(saved);
  }

  private bind(userId: string): MusicProviderPort {
    if (this.music instanceof SpotifyMusicProvider) {
      return this.music.forUser(userId);
    }
    return this.music;
  }
}
