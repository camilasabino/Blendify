import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  MUSIC_PROVIDER_FACTORY,
  type MusicProviderFactoryPort,
} from '../../domain/repositories/music-provider.factory.port';
import {
  PLAYLIST_REPOSITORY,
  PlaylistRepositoryPort,
} from '../../domain/repositories/playlist.repository.port';
import { PlaylistStatus } from '../../domain/playlist/playlist-status';
import { isSpotifyQuotaError } from '../../domain/genre/catalog-resolve';
import { toPlaylistSummary } from '../dto/playlist-response.dto';
import type { PlaylistLibraryPage, PlaylistSummary } from '@blendify/contracts';

@Injectable()
export class ListLibraryPlaylistsUseCase {
  private readonly logger = new Logger(ListLibraryPlaylistsUseCase.name);

  constructor(
    @Inject(PLAYLIST_REPOSITORY)
    private readonly playlists: PlaylistRepositoryPort,
    @Inject(MUSIC_PROVIDER_FACTORY)
    private readonly providers: MusicProviderFactoryPort,
  ) {}

  async execute(
    userId: string,
    options: {
      sync?: boolean;
      limit?: number;
      offset?: number;
      q?: string;
    } = {},
  ): Promise<PlaylistLibraryPage> {
    const limit = Math.min(Math.max(options.limit ?? 5, 1), 50);
    const offset = Math.max(options.offset ?? 0, 0);
    const q = options.q?.trim() || undefined;

    try {
      await this.playlists.deleteFailedByUserId(userId);
    } catch (error) {
      this.logger.warn(
        `Could not purge failed playlists: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const page = await this.playlists.listLibraryPage(userId, {
      limit,
      offset,
      q,
    });
    const presence = await this.playlists.countLibraryPresence(userId, q);

    if (!options.sync) {
      return {
        playlists: page.items.map(toPlaylistSummary),
        total: page.total,
        limit,
        offset,
        activeCount: presence.active,
        deletedCount: presence.deleted,
      };
    }

    const provider = this.providers.forUser(userId);
    let libraryIds: Set<string> | null = null;
    try {
      libraryIds = await provider.listLibraryPlaylistIds();
    } catch (error) {
      if (isSpotifyQuotaError(error)) throw error;
      this.logger.warn(
        `Could not list Spotify library playlists: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const visible: PlaylistSummary[] = [];

    for (const playlist of page.items) {
      if (playlist.missingOnSpotify) {
        visible.push(toPlaylistSummary(playlist));
        continue;
      }

      if (!playlist.spotifyId || playlist.status !== PlaylistStatus.COMPLETED) {
        visible.push(toPlaylistSummary(playlist));
        continue;
      }

      try {
        const stillInLibrary =
          libraryIds === null ? true : libraryIds.has(playlist.spotifyId);

        if (!stillInLibrary) {
          this.logger.log(
            `Playlist ${playlist.id} not in Spotify library — marking deleted`,
          );
          playlist.markMissingOnSpotify();
          const saved = await this.playlists.save(playlist);
          visible.push(toPlaylistSummary(saved));
          continue;
        }

        const remote = await provider.getPlaylistSnapshot(playlist.spotifyId);
        if (!remote) {
          this.logger.log(
            `Playlist ${playlist.id} missing on Spotify — marking deleted`,
          );
          playlist.markMissingOnSpotify();
          const saved = await this.playlists.save(playlist);
          visible.push(toPlaylistSummary(saved));
          continue;
        }

        playlist.syncFromSpotify({
          name: remote.name,
          url: remote.url,
          trackCount: remote.trackCount,
          totalDurationMs: remote.totalDurationMs,
          imageUrl: remote.imageUrl,
          tracks: remote.tracks,
        });
        const saved = await this.playlists.save(playlist);
        visible.push(toPlaylistSummary(saved));
      } catch (error) {
        // Surface quota / rate-limit so the Library UI can tell the user.
        // Partial updates already saved above stay in the database.
        if (isSpotifyQuotaError(error)) throw error;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Sync failed for playlist ${playlist.id}: ${message}`);
        visible.push(toPlaylistSummary(playlist));
      }
    }

    const presenceAfter = await this.playlists.countLibraryPresence(userId, q);

    return {
      playlists: visible,
      total: page.total,
      limit,
      offset,
      activeCount: presenceAfter.active,
      deletedCount: presenceAfter.deleted,
    };
  }
}
