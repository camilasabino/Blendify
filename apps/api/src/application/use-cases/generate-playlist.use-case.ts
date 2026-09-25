import { Injectable } from '@nestjs/common';
import {
  GenerateDiscoverRequestSchema,
  GenerateMixRequestSchema,
} from '@blendify/contracts';
import type { z } from 'zod';
import { GeneratedPlaylist } from '../../domain/playlist/generated-playlist';
import {
  monotonicProgressReporter,
  type ProgressReporter,
} from '../services/generation-progress.tracker';
import { GenerateArtistMixUseCase } from './generate-artist-mix.use-case';
import { GenerateGenreMixUseCase } from './generate-genre-mix.use-case';
import { GenerateDiscoverPlaylistUseCase } from './generate-discover-playlist.use-case';

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
    options?: { onProgress?: ProgressReporter },
  ): Promise<GeneratedPlaylist> {
    switch (request.kind) {
      case 'artist_mix':
        return this.artistMix.execute(request, progressOptions(options));
      case 'genre_mix':
        return this.genreMix.execute(request, progressOptions(options));
      default:
        return this.discover.execute(
          request,
          progressOptions({
            onProgress: monotonicProgressReporter(options?.onProgress),
          }),
        );
    }
  }
}

function progressOptions(options?: { onProgress?: ProgressReporter }) {
  return options?.onProgress ? { onProgress: options.onProgress } : undefined;
}
