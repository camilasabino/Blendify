import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PLAYLIST_REPOSITORY,
  PlaylistRepositoryPort,
} from '../../domain/repositories/playlist.repository.port';
import { Playlist } from '../../domain/playlist/playlist.entity';
import { RemovePlaylistFromLibraryUseCase } from './remove-playlist-from-library.use-case';
import type { BulkLibraryAction, BulkLibraryResult } from '@blendify/contracts';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';

@Injectable()
export class BulkLibraryUseCase {
  private readonly logger = new Logger(BulkLibraryUseCase.name);

  constructor(
    @Inject(PLAYLIST_REPOSITORY)
    private readonly playlists: PlaylistRepositoryPort,
    private readonly remove: RemovePlaylistFromLibraryUseCase,
  ) {}

  async execute(
    userId: string,
    action: BulkLibraryAction,
    options: { q?: string; playlistIds?: string[] } = {},
  ): Promise<BulkLibraryResult> {
    const scoped = await this.playlists.listLibrary(userId, {
      q: options.playlistIds?.length ? undefined : options.q,
      playlistIds: options.playlistIds,
    });

    if (action === 'clear_library') {
      const { affected, failed } = await this.clearLibrary(userId, scoped);
      return { action, affected, failed };
    }

    const active = scoped.filter((playlist) => !playlist.missingOnSpotify);
    const { affected, failed } = await this.purgeActive(userId, active);
    return { action, affected, failed };
  }

  private async clearLibrary(
    userId: string,
    scoped: Playlist[],
  ): Promise<{ affected: number; failed: number }> {
    let affected = 0;
    let failed = 0;

    for (const playlist of scoped) {
      try {
        await this.remove.execute(userId, playlist.id, {
          fromSpotify: false,
        });
        affected += 1;
      } catch (error) {
        failed += 1;
        this.logger.warn(
          `clear_library failed for ${playlist.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { affected, failed };
  }

  private async purgeActive(
    userId: string,
    active: Playlist[],
  ): Promise<{ affected: number; failed: number }> {
    let affected = 0;
    let failed = 0;

    for (const playlist of active) {
      try {
        await this.remove.execute(userId, playlist.id, {
          fromSpotify: Boolean(playlist.spotifyId),
        });
        affected += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`purge_active failed for ${playlist.id}: ${message}`);
        if (isSpotifyQuotaBusinessError(error)) {
          this.logger.warn(
            'Stopping bulk purge early due to Spotify quota/rate limit',
          );
          failed += Math.max(0, active.length - affected - failed);
          break;
        }
      }
    }

    return { affected, failed };
  }
}

function isSpotifyQuotaBusinessError(error: unknown): boolean {
  return (
    error instanceof BusinessRuleError &&
    (error.code === 'SPOTIFY_RATE_LIMITED' ||
      error.code === 'SPOTIFY_QUOTA_EXCEEDED')
  );
}
