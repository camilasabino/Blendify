import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PLAYLIST_REPOSITORY,
  PlaylistRepositoryPort,
} from '../../domain/repositories/playlist.repository.port';
import { DeletePlaylistHistoryUseCase } from './delete-playlist-history.use-case';

export type BulkHistoryAction = 'purge_active' | 'clear_deleted';

export interface BulkHistoryResult {
  action: BulkHistoryAction;
  affected: number;
  failed: number;
}

@Injectable()
export class BulkPlaylistHistoryUseCase {
  private readonly logger = new Logger(BulkPlaylistHistoryUseCase.name);

  constructor(
    @Inject(PLAYLIST_REPOSITORY)
    private readonly playlists: PlaylistRepositoryPort,
    private readonly remove: DeletePlaylistHistoryUseCase,
  ) {}

  async execute(
    userId: string,
    action: BulkHistoryAction,
    options: { q?: string } = {},
  ): Promise<BulkHistoryResult> {
    const q = options.q?.trim().toLowerCase();
    const items = await this.playlists.findByUserId(userId);
    const scoped = q
      ? items.filter((p) => p.name.getValue().toLowerCase().includes(q))
      : items;

    let affected = 0;
    let failed = 0;

    if (action === 'clear_deleted') {
      const deleted = scoped.filter((p) => p.missingOnSpotify);
      for (const playlist of deleted) {
        try {
          await this.remove.execute(userId, playlist.id, {
            fromSpotify: false,
          });
          affected += 1;
        } catch (error) {
          failed += 1;
          this.logger.warn(
            `clear_deleted failed for ${playlist.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      return { action, affected, failed };
    }

    const active = scoped.filter((p) => !p.missingOnSpotify);
    for (const playlist of active) {
      try {
        if (playlist.spotifyId) {
          await this.remove.execute(userId, playlist.id, { fromSpotify: true });
        } else {
          await this.remove.execute(userId, playlist.id, {
            fromSpotify: false,
          });
        }
        affected += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`purge_active failed for ${playlist.id}: ${message}`);
        if (
          /SPOTIFY_RATE_LIMITED|SPOTIFY_QUOTA_EXCEEDED|rate limit|quota|429/i.test(
            message,
          )
        ) {
          this.logger.warn(
            'Stopping bulk purge early due to Spotify quota/rate limit',
          );
          failed += active.length - affected - failed;
          break;
        }
      }
    }

    return { action, affected, failed };
  }
}
