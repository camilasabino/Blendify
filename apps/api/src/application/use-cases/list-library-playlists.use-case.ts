import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PLAYLIST_REPOSITORY,
  PlaylistRepositoryPort,
} from '../../domain/repositories/playlist.repository.port';
import { toPlaylistSummary } from '../dto/playlist-response.dto';
import type { PlaylistLibraryPage } from '@blendify/contracts';

@Injectable()
export class ListLibraryPlaylistsUseCase {
  private readonly logger = new Logger(ListLibraryPlaylistsUseCase.name);

  constructor(
    @Inject(PLAYLIST_REPOSITORY)
    private readonly playlists: PlaylistRepositoryPort,
  ) {}

  async execute(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      q?: string;
    } = {},
  ): Promise<PlaylistLibraryPage> {
    const limit = Math.min(Math.max(options.limit ?? 5, 1), 50);
    const offset = Math.max(options.offset ?? 0, 0);
    const q = options.q?.trim() || undefined;

    await this.purgeFailedPlaylists(userId);

    const page = await this.playlists.listLibraryPage(userId, {
      limit,
      offset,
      q,
    });
    const presence = await this.playlists.countLibraryPresence(userId, q);

    return {
      playlists: page.items.map(toPlaylistSummary),
      total: page.total,
      limit,
      offset,
      activeCount: presence.active,
      deletedCount: presence.deleted,
    };
  }

  private async purgeFailedPlaylists(userId: string): Promise<void> {
    try {
      await this.playlists.deleteFailedByUserId(userId);
    } catch (error) {
      this.logger.warn(
        `Could not purge failed playlists: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
