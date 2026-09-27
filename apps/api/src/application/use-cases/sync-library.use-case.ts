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
import type { LibrarySyncResult } from '@blendify/contracts';

@Injectable()
export class SyncLibraryUseCase {
  private readonly logger = new Logger(SyncLibraryUseCase.name);

  constructor(
    @Inject(PLAYLIST_REPOSITORY)
    private readonly playlists: PlaylistRepositoryPort,
    @Inject(MUSIC_PROVIDER_FACTORY)
    private readonly providers: MusicProviderFactoryPort,
  ) {}

  async execute(userId: string): Promise<LibrarySyncResult> {
    const library = await this.playlists.listLibrary(userId, {});
    const provider = this.providers.forUser(userId);
    const libraryIds = await this.fetchLibraryPlaylistIds(provider);

    const confirmedMissingIds: string[] = [];
    for (const playlist of library) {
      await this.syncPlaylist(
        playlist,
        provider,
        libraryIds,
        confirmedMissingIds,
      );
    }

    if (confirmedMissingIds.length > 0) {
      await this.playlists.deleteMany(userId, confirmedMissingIds);
    }

    return {
      checkedCount: library.length,
      removedCount: confirmedMissingIds.length,
    };
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

  private async syncPlaylist(
    playlist: Playlist,
    provider: MusicProviderPort,
    libraryIds: Set<string> | null,
    confirmedMissingIds: string[],
  ): Promise<void> {
    if (!playlist.spotifyId || playlist.status !== PlaylistStatus.COMPLETED) {
      return;
    }

    try {
      await this.syncCompletedPlaylist(
        playlist,
        provider,
        libraryIds,
        confirmedMissingIds,
      );
    } catch (error) {
      if (isSpotifyQuotaError(error)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Sync failed for playlist ${playlist.id}: ${message}`);
    }
  }

  private async syncCompletedPlaylist(
    playlist: Playlist,
    provider: MusicProviderPort,
    libraryIds: Set<string> | null,
    confirmedMissingIds: string[],
  ): Promise<void> {
    const spotifyId = playlist.spotifyId!;
    const stillInLibrary =
      libraryIds === null ? true : libraryIds.has(spotifyId);
    const remote = await provider.getPlaylistSnapshot(spotifyId);

    if (!remote) {
      if (!stillInLibrary) {
        this.logger.log(
          `Playlist ${playlist.id} absent from the Spotify library and confirmed 404 — marking for removal`,
        );
        confirmedMissingIds.push(playlist.id);
        return;
      }
      throw new Error(
        `Spotify listed playlist ${playlist.id} as present but its individual lookup returned 404 — insufficient evidence to delete`,
      );
    }

    playlist.syncFromSpotify({
      name: remote.name,
      url: remote.url,
      trackCount: remote.trackCount,
      totalDurationMs: remote.totalDurationMs,
      imageUrl: remote.imageUrl,
      tracks: remote.tracks,
    });
    await this.playlists.save(playlist);
  }
}
