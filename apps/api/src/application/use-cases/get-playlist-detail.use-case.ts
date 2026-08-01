import { Inject, Injectable } from '@nestjs/common';
import type { PlaylistDetail } from '@blendify/contracts';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import {
  PLAYLIST_REPOSITORY,
  type PlaylistRepositoryPort,
} from '../../domain/repositories/playlist.repository.port';
import { toPlaylistDetail } from '../dto/playlist-response.dto';

@Injectable()
export class GetPlaylistDetailUseCase {
  constructor(
    @Inject(PLAYLIST_REPOSITORY)
    private readonly playlists: PlaylistRepositoryPort,
  ) {}

  async execute(userId: string, playlistId: string): Promise<PlaylistDetail> {
    const playlist = await this.playlists.findById(playlistId);
    if (!playlist || playlist.userId !== userId) {
      throw BusinessRuleError.playlistNotFound(playlistId);
    }
    return toPlaylistDetail(playlist);
  }
}
