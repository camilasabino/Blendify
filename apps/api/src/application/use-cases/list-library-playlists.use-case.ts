import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  MUSIC_PROVIDER_FACTORY,
  type MusicProviderFactoryPort,
} from '../../domain/repositories/music-provider.factory.port';
import type { MusicProviderPort } from '../../domain/repositories/music-provider.port';
import {
  PLAYLIST_REPOSITORY,
  PlaylistRepositoryPort,
} from '../../domain/repositories/playlist.repository.port';
import { Playlist } from '../../domain/playlist/playlist.entity';
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

    await this.purgeFailedPlaylists(userId);

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
    const libraryIds = await this.fetchLibraryPlaylistIds(provider);
    const visible: PlaylistSummary[] = [];

    for (const playlist of page.items) {
      visible.push(
        await this.syncLibraryPlaylist(playlist, provider, libraryIds),
      );
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

  private async fetchLibraryPlaylistIds(
    provider: MusicProviderPort,
  ): Promise<Set<string> | null> {
    try {
      return await provider.listLibraryPlaylistIds();
    } catch (error) {
      if (isSpotifyQuotaError(error)) throw error;
      this.logger.warn(
        `Could not list Spotify library playlists: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private async syncLibraryPlaylist(
    playlist: Playlist,
    provider: MusicProviderPort,
    libraryIds: Set<string> | null,
  ): Promise<PlaylistSummary> {
    if (playlist.missingOnSpotify) {
      return toPlaylistSummary(playlist);
    }

    if (!playlist.spotifyId || playlist.status !== PlaylistStatus.COMPLETED) {
      return toPlaylistSummary(playlist);
    }

    try {
      return await this.syncCompletedPlaylist(playlist, provider, libraryIds);
    } catch (error) {
      // Surface quota / rate-limit so the Library UI can tell the user.
      // Partial updates already saved above stay in the database.
      if (isSpotifyQuotaError(error)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Sync failed for playlist ${playlist.id}: ${message}`);
      return toPlaylistSummary(playlist);
    }
  }

  private async syncCompletedPlaylist(
    playlist: Playlist,
    provider: MusicProviderPort,
    libraryIds: Set<string> | null,
  ): Promise<PlaylistSummary> {
    const spotifyId = playlist.spotifyId!;
    const stillInLibrary =
      libraryIds === null ? true : libraryIds.has(spotifyId);

    if (!stillInLibrary) {
      this.logger.log(
        `Playlist ${playlist.id} not in Spotify library — marking deleted`,
      );
      return this.markPlaylistMissing(playlist);
    }

    const remote = await provider.getPlaylistSnapshot(spotifyId);
    if (!remote) {
      this.logger.log(
        `Playlist ${playlist.id} missing on Spotify — marking deleted`,
      );
      return this.markPlaylistMissing(playlist);
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
    return toPlaylistSummary(saved);
  }

  private async markPlaylistMissing(
    playlist: Playlist,
  ): Promise<PlaylistSummary> {
    playlist.markMissingOnSpotify();
    const saved = await this.playlists.save(playlist);
    return toPlaylistSummary(saved);
  }
}
