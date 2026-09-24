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
} from '../../domain/repositories/music-provider.factory.port';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
} from '../../domain/repositories/user.repository.port';
import {
  USAGE_STATS_REPOSITORY,
  UsageStatsRepositoryPort,
  type SeedUsageInput,
} from '../../domain/repositories/usage-stats.repository.port';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import { GeneratedPlaylist } from '../../domain/playlist/generated-playlist';
import { Playlist } from '../../domain/playlist/playlist.entity';
import { PublishPlaylistService } from '../services/publish-playlist.service';
import {
  monotonicProgressReporter,
  type ProgressReporter,
} from '../services/generation-progress.tracker';
import { GenerateArtistMixUseCase } from './generate-artist-mix.use-case';
import { GenerateGenreMixUseCase } from './generate-genre-mix.use-case';
import { GenerateDiscoverPlaylistUseCase } from './generate-discover-playlist.use-case';

export type SpotifyPlaylistRequest =
  | z.output<typeof CreateMixRequestSchema>
  | z.output<typeof CreateDiscoverRequestSchema>;

type GenerationRequest = DistributiveOmit<
  SpotifyPlaylistRequest,
  'coverImageBase64' | 'persistToLibrary'
>;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

type UsageRecord = {
  kind: 'artist' | 'genre';
  seeds: SeedUsageInput[];
};

@Injectable()
export class CreateSpotifyPlaylistUseCase {
  private readonly logger = new Logger(CreateSpotifyPlaylistUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(MUSIC_PROVIDER_FACTORY)
    private readonly providers: MusicProviderFactoryPort,
    @Inject(USAGE_STATS_REPOSITORY)
    private readonly usageStats: UsageStatsRepositoryPort,
    private readonly artistMix: GenerateArtistMixUseCase,
    private readonly genreMix: GenerateGenreMixUseCase,
    private readonly discover: GenerateDiscoverPlaylistUseCase,
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
    const onProgress = isDiscover(request)
      ? monotonicProgressReporter(options?.onProgress)
      : options?.onProgress;

    const generated = await this.generate(request, onProgress);

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
      fallbackImageUrl: generated.coverCandidateUrl,
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

  private generate(
    request: GenerationRequest,
    onProgress?: ProgressReporter,
  ): Promise<GeneratedPlaylist> {
    const options = onProgress ? { onProgress } : undefined;
    switch (request.kind) {
      case 'artist_mix':
        return this.artistMix.execute(request, options);
      case 'genre_mix':
        return this.genreMix.execute(request, options);
      default:
        return this.discover.execute(request, options);
    }
  }
}

function isDiscover(request: GenerationRequest): boolean {
  return (
    request.kind === 'discover_artist' || request.kind === 'discover_track'
  );
}

function usageRecordFor(generated: GeneratedPlaylist): UsageRecord {
  const { generation } = generated;
  switch (generation.kind) {
    case 'artist_mix':
      return {
        kind: 'artist',
        seeds: generation.seeds.map((seed) => ({
          kind: 'artist',
          seedKey: seed.id,
          name: seed.name,
          imageUrl: seed.imageUrl ?? null,
        })),
      };
    case 'discover_artist':
      return {
        kind: 'artist',
        seeds: [
          {
            kind: 'artist',
            seedKey: generation.seed.id,
            name: generation.seed.name,
            imageUrl: generation.seed.imageUrl ?? null,
          },
        ],
      };
    case 'discover_track':
      return {
        kind: 'artist',
        seeds: [
          {
            kind: 'artist',
            seedKey: generation.seed.artistId,
            name: generation.seed.artistName,
            imageUrl: generation.seed.albumImageUrl ?? null,
          },
        ],
      };
    case 'genre_mix':
      return {
        kind: 'genre',
        seeds: generated.seeds.flatMap((seed) =>
          seed.type === 'genre'
            ? [
                {
                  kind: 'genre' as const,
                  seedKey: seed.id,
                  name: seed.name,
                  imageUrl: seed.imageUrl ?? null,
                },
              ]
            : [],
        ),
      };
  }
}
