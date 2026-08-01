import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PlaylistDetail } from '@blendify/contracts';
import {
  PLAYLIST_REPOSITORY,
  type PlaylistRepositoryPort,
} from '../../domain/repositories/playlist.repository.port';
import type { MusicProviderPort } from '../../domain/repositories/music-provider.port';
import { Playlist } from '../../domain/playlist/playlist.entity';
import { toPlaylistDetail } from '../dto/playlist-response.dto';
import type { ProgressReporter } from './generation-progress.tracker';
import { GenerationProgressTracker } from './generation-progress.tracker';

@Injectable()
export class PublishPlaylistService {
  private readonly logger = new Logger(PublishPlaylistService.name);

  constructor(
    @Inject(PLAYLIST_REPOSITORY)
    private readonly playlists: PlaylistRepositoryPort,
  ) {}

  async execute(input: {
    playlist: Playlist;
    provider: MusicProviderPort;
    spotifyUserId: string;
    coverImageBase64?: string;
    fallbackImageUrl?: string;
    persistToLibrary: boolean;
    onProgress?: ProgressReporter;
  }): Promise<PlaylistDetail> {
    const { playlist, provider } = input;
    const tracker = new GenerationProgressTracker(input.onProgress);
    const steps = input.coverImageBase64 ? 4 : 3;
    let step = 0;

    tracker.report('publishing', step, steps);
    const remote = await provider.createPlaylist({
      userId: input.spotifyUserId,
      name: playlist.name.getValue(),
      description: playlist.description,
      isPublic: false,
    });
    step += 1;
    tracker.report('publishing', step, steps);

    await provider.addTracksToPlaylist(
      remote.id,
      playlist.tracks.map((track) => track.uri),
    );
    step += 1;
    tracker.report('publishing', step, steps);

    if (input.coverImageBase64) {
      try {
        await provider.uploadPlaylistCover(remote.id, input.coverImageBase64);
      } catch (error) {
        this.logger.warn(
          `Playlist cover upload failed: ${errorMessage(error)}`,
        );
      }
      step += 1;
      tracker.report('publishing', step, steps);
    }

    playlist.linkToSpotify(remote.id, remote.url);
    try {
      const snapshot = await provider.getPlaylistSnapshot(remote.id);
      playlist.setImageUrl(snapshot?.imageUrl ?? input.fallbackImageUrl);
    } catch (error) {
      this.logger.warn(`Playlist image lookup failed: ${errorMessage(error)}`);
      playlist.setImageUrl(input.fallbackImageUrl);
    }
    playlist.markCompleted();

    const result = input.persistToLibrary
      ? await this.playlists.save(playlist)
      : playlist;
    tracker.report('publishing', steps, steps);
    return toPlaylistDetail(result);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
