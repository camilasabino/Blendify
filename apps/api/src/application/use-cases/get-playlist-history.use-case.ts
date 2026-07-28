import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  MUSIC_PROVIDER,
  MusicProviderPort,
} from '../../domain/repositories/music-provider.port';
import {
  PLAYLIST_REPOSITORY,
  PlaylistRepositoryPort,
} from '../../domain/repositories/playlist.repository.port';
import { PlaylistStatus } from '../../domain/playlist/playlist-status';
import {
  PlaylistResponseDto,
  toPlaylistResponse,
} from '../dto/playlist-response.dto';
import { SpotifyMusicProvider } from '../../infrastructure/spotify/spotify-music.provider';

export type PlaylistHistoryResult = {
  playlists: PlaylistResponseDto[];
  total: number;
  limit: number;
  offset: number;
  activeCount: number;
  deletedCount: number;
};

@Injectable()
export class GetPlaylistHistoryUseCase {
  private readonly logger = new Logger(GetPlaylistHistoryUseCase.name);

  constructor(
    @Inject(PLAYLIST_REPOSITORY)
    private readonly playlists: PlaylistRepositoryPort,
    @Inject(MUSIC_PROVIDER) private readonly music: MusicProviderPort,
  ) {}

  async execute(
    userId: string,
    options: {
      sync?: boolean;
      limit?: number;
      offset?: number;
      q?: string;
    } = {},
  ): Promise<PlaylistHistoryResult> {
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

    const page = await this.playlists.findByUserIdPage(userId, {
      limit,
      offset,
      q,
    });
    const presence = await this.playlists.countPresence(userId, q);

    if (!options.sync) {
      return {
        playlists: page.items.map(toPlaylistResponse),
        total: page.total,
        limit,
        offset,
        activeCount: presence.active,
        deletedCount: presence.deleted,
      };
    }

    const provider = this.bind(userId);
    let libraryIds: Set<string> | null = null;
    try {
      libraryIds = await provider.listLibraryPlaylistIds();
    } catch (error) {
      this.logger.warn(
        `Could not list Spotify library playlists: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const visible: PlaylistResponseDto[] = [];
    let stopSync = false;

    for (const playlist of page.items) {
      if (playlist.missingOnSpotify) {
        visible.push(toPlaylistResponse(playlist));
        continue;
      }

      if (!playlist.spotifyId || playlist.status !== PlaylistStatus.COMPLETED) {
        visible.push(toPlaylistResponse(playlist));
        continue;
      }

      if (stopSync) {
        visible.push(toPlaylistResponse(playlist));
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
          visible.push(toPlaylistResponse(saved));
          continue;
        }

        const remote = await provider.getPlaylistSnapshot(playlist.spotifyId);
        if (!remote) {
          this.logger.log(
            `Playlist ${playlist.id} missing on Spotify — marking deleted`,
          );
          playlist.markMissingOnSpotify();
          const saved = await this.playlists.save(playlist);
          visible.push(toPlaylistResponse(saved));
          continue;
        }

        playlist.syncFromSpotify({
          name: remote.name,
          url: remote.url,
          trackCount: remote.trackCount,
          totalDurationMs: remote.totalDurationMs,
          imageUrl: remote.imageUrl,
        });
        const saved = await this.playlists.save(playlist);
        visible.push(toPlaylistResponse(saved));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Sync failed for playlist ${playlist.id}: ${message}`);
        if (
          /SPOTIFY_RATE_LIMITED|SPOTIFY_QUOTA_EXCEEDED|rate limit|QUOTA_EXCEEDED|429/i.test(
            message,
          )
        ) {
          stopSync = true;
        }
        visible.push(toPlaylistResponse(playlist));
      }
    }

    const presenceAfter = await this.playlists.countPresence(userId, q);

    return {
      playlists: visible,
      total: page.total,
      limit,
      offset,
      activeCount: presenceAfter.active,
      deletedCount: presenceAfter.deleted,
    };
  }

  private bind(userId: string): MusicProviderPort {
    if (this.music instanceof SpotifyMusicProvider) {
      return this.music.forUser(userId);
    }
    return this.music;
  }
}
