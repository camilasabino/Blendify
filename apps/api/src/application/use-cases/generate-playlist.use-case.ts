import { Injectable } from '@nestjs/common';
import {
  GenerateDiscoverRequestSchema,
  GenerateMixRequestSchema,
} from '@blendify/contracts';
import type { z } from 'zod';
import { GeneratedPlaylist } from '@/domain/playlist/generated-playlist';
import type { TrackAcceptance } from '@/domain/services/accepted-track-pool';
import {
  monotonicProgressReporter,
  type ProgressReporter,
} from '@/application/services/generation-progress.tracker';
import { GenerateArtistMixUseCase } from './generate-artist-mix.use-case';
import { GenerateGenreMixUseCase } from './generate-genre-mix.use-case';
import { GenerateDiscoverPlaylistUseCase } from './generate-discover-playlist.use-case';

export interface PlaylistGenerationOptions {
  onProgress?: ProgressReporter;
  acceptTrack?: TrackAcceptance;
}

export type PlaylistGenerationRequest =
  | z.output<typeof GenerateMixRequestSchema>
  | z.output<typeof GenerateDiscoverRequestSchema>;

@Injectable()
export class GeneratePlaylistUseCase {
  constructor(
    private readonly artistMix: GenerateArtistMixUseCase,
    private readonly genreMix: GenerateGenreMixUseCase,
    private readonly discover: GenerateDiscoverPlaylistUseCase,
  ) {}

  execute(
    request: PlaylistGenerationRequest,
    options?: PlaylistGenerationOptions,
  ): Promise<GeneratedPlaylist> {
    switch (request.kind) {
      case 'artist_mix':
        return this.artistMix.execute(request, generationOptions(options));
      case 'genre_mix':
        return this.genreMix.execute(request, generationOptions(options));
      default:
        return this.discover.execute(
          request,
          generationOptions({
            ...options,
            onProgress: monotonicProgressReporter(options?.onProgress),
          }),
        );
    }
  }
}

function generationOptions(
  options?: PlaylistGenerationOptions,
): PlaylistGenerationOptions | undefined {
  const selected = {
    ...(options?.onProgress ? { onProgress: options.onProgress } : {}),
    ...(options?.acceptTrack ? { acceptTrack: options.acceptTrack } : {}),
  };
  return Object.keys(selected).length > 0 ? selected : undefined;
}
