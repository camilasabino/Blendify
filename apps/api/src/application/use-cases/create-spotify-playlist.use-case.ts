import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CreateDiscoverRequestSchema,
  CreateMixRequestSchema,
  type PlaylistDetail,
} from '@blendify/contracts';
import type { z } from 'zod';
import {
  MUSIC_PROVIDER_FACTORY,
  type MusicProviderFactoryPort,
} from '@/domain/repositories/music-provider.factory.port';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
} from '@/domain/repositories/user.repository.port';
import {
  USAGE_STATS_REPOSITORY,
  UsageStatsRepositoryPort,
} from '@/domain/repositories/usage-stats.repository.port';
import { BusinessRuleError } from '@/domain/errors/business-rule.error';
import { Playlist } from '@/domain/playlist/playlist.entity';
import { PublishPlaylistService } from '@/application/services/publish-playlist.service';
import type { ProgressReporter } from '@/application/services/generation-progress.tracker';
import { usageRecordFor } from '@/application/services/playlist-usage-record';
import { GeneratePlaylistUseCase } from './generate-playlist.use-case';

export type SpotifyPlaylistRequest =
  | z.output<typeof CreateMixRequestSchema>
  | z.output<typeof CreateDiscoverRequestSchema>;

@Injectable()
export class CreateSpotifyPlaylistUseCase {
  private readonly logger = new Logger(CreateSpotifyPlaylistUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(MUSIC_PROVIDER_FACTORY)
    private readonly providers: MusicProviderFactoryPort,
    @Inject(USAGE_STATS_REPOSITORY)
    private readonly usageStats: UsageStatsRepositoryPort,
    private readonly generator: GeneratePlaylistUseCase,
    private readonly publisher: PublishPlaylistService,
  ) {}

  async execute(
    input: { userId: string; request: SpotifyPlaylistRequest },
    options?: { onProgress?: ProgressReporter },
  ): Promise<PlaylistDetail> {
    const user = await this.users.findById(input.userId);
    if (!user) {
      throw new BusinessRuleError('User not found', 'USER_NOT_FOUND');
    }

    const { coverImageBase64, persistToLibrary, ...request } = input.request;
    const onProgress = options?.onProgress;

    const generated = await this.generator.execute(
      request,
      onProgress ? { onProgress } : undefined,
    );

    const playlist = Playlist.create({
      id: randomUUID(),
      userId: user.id,
      name: generated.name,
      description: generated.description,
      seeds: [...generated.seeds],
      tracks: [...generated.tracks],
      generation: generated.generation,
    });
    const response = await this.publisher.execute({
      playlist,
      provider: this.providers.forUser(user.id),
      spotifyUserId: user.spotifyId,
      coverImageBase64,
      persistToLibrary,
      onProgress,
    });

    try {
      await this.usageStats.recordMix({
        userId: user.id,
        ...usageRecordFor(generated),
      });
    } catch (statsError) {
      this.logger.warn(
        `Usage stats recording failed: ${
          statsError instanceof Error ? statsError.message : String(statsError)
        }`,
      );
    }

    return response;
  }
}
