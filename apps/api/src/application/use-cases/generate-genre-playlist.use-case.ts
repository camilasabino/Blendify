import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  GenreMixRequestSchema,
  type PlaylistDetail,
} from '@blendify/contracts';
import {
  CATALOG_PROVIDER_FACTORY,
  type CatalogProviderFactoryPort,
} from '../../domain/repositories/catalog-provider.port';
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
} from '../../domain/repositories/usage-stats.repository.port';
import { Playlist } from '../../domain/playlist/playlist.entity';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import {
  MAX_GENRES,
  MAX_TRACKS,
  maxTracksPerSeedForCount,
} from '../../domain/constants';
import {
  findCuratedGenre,
  genreTrackGroupKey,
  type CuratedGenre,
} from '../../domain/genre/curated-genres';
import { GenrePlaylistGenerationService } from '../../domain/genre/genre-playlist-generation.service';
import {
  buildDefaultPlaylistDescription,
  buildDefaultPlaylistName,
} from '../../domain/playlist/default-playlist-name';
import { z } from 'zod';
import { GenreTrackCatalogService } from '../services/genre-track-catalog.service';
import { PublishPlaylistService } from '../services/publish-playlist.service';
import {
  GenerationProgressTracker,
  type ProgressReporter,
} from '../services/generation-progress.tracker';

const GenerateGenrePlaylistSchema = GenreMixRequestSchema.extend({
  userId: z.string().min(1),
  market: z.string().optional(),
});

type GenerateGenrePlaylistDto = z.input<typeof GenerateGenrePlaylistSchema>;

@Injectable()
export class GenerateGenrePlaylistUseCase {
  private readonly generation = new GenrePlaylistGenerationService();
  private readonly logger = new Logger(GenerateGenrePlaylistUseCase.name);

  constructor(
    @Inject(CATALOG_PROVIDER_FACTORY)
    private readonly catalogs: CatalogProviderFactoryPort,
    @Inject(MUSIC_PROVIDER_FACTORY)
    private readonly providers: MusicProviderFactoryPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(USAGE_STATS_REPOSITORY)
    private readonly usageStats: UsageStatsRepositoryPort,
    private readonly genreTrackCatalog: GenreTrackCatalogService,
    private readonly publisher: PublishPlaylistService,
  ) {}

  async execute(
    raw: GenerateGenrePlaylistDto,
    options?: { onProgress?: ProgressReporter },
  ): Promise<PlaylistDetail> {
    const input = GenerateGenrePlaylistSchema.parse(raw);
    const tracker = new GenerationProgressTracker(options?.onProgress);
    const user = await this.users.findById(input.userId);
    if (!user) {
      throw new BusinessRuleError('User not found', 'USER_NOT_FOUND');
    }

    const genres = this.resolveGenres(input.genreIds);
    if (genres.length === 0) {
      throw BusinessRuleError.emptyGenreSelection();
    }
    tracker.report('resolving_seeds', genres.length, genres.length);

    const maxPerGenre = maxTracksPerSeedForCount(genres.length);
    if (input.tracksPerSeed > maxPerGenre) {
      throw new BusinessRuleError(
        `At most ${maxPerGenre} tracks per genre for ${genres.length} genre(s) (cap ${MAX_TRACKS}).`,
        'TRACK_BUDGET_EXCEEDED',
      );
    }

    const seedNames = genres.map((g) => g.name);
    const playlistName =
      input.name.trim() ||
      buildDefaultPlaylistName({
        names: seedNames,
      });
    const playlistDescription =
      input.description.trim() ||
      buildDefaultPlaylistDescription({
        names: seedNames,
      });

    const catalog = this.catalogs.forMarket(input.market);
    const totalNeeded = genres.length * input.tracksPerSeed;
    tracker.report('matching_tracks', 0, Math.max(1, totalNeeded));
    const { tracksByGenre, coverCandidates } =
      await this.genreTrackCatalog.resolve(
        catalog,
        genres,
        input.popularity,
        input.tracksPerSeed,
        {
          onMatched: (matched) => {
            tracker.report(
              'matching_tracks',
              Math.min(matched, totalNeeded),
              Math.max(1, totalNeeded),
            );
          },
        },
      );

    const { tracks } = this.generation.generate({
      tracksByGenre,
      tracksPerSeed: input.tracksPerSeed,
      orderMode: input.orderMode,
    });

    if (tracks.length === 0) {
      throw BusinessRuleError.noTracksFound({
        names: genres.map((g) => g.name),
        popularity: input.popularity,
        source: 'genres',
      });
    }

    const seeds = genres.map((genre) => ({
      type: 'genre' as const,
      id: genre.id,
      name: genre.name,
      imageUrl: coverCandidates.get(genreTrackGroupKey(genre.id)) ?? null,
    }));
    const playlist = Playlist.create({
      id: randomUUID(),
      userId: user.id,
      name: playlistName,
      description: playlistDescription,
      seeds,
      tracks,
      generation: {
        version: 1,
        kind: 'genre_mix',
        tracksPerSeed: input.tracksPerSeed,
        seeds: genres.map(({ id, name }) => ({ id, name })),
        popularity: input.popularity,
        orderMode: input.orderMode,
      },
    });
    const response = await this.publisher.execute({
      playlist,
      provider: this.providers.forUser(user.id),
      spotifyUserId: user.spotifyId,
      coverImageBase64: input.coverImageBase64,
      fallbackImageUrl: tracks.find((track) => track.albumImageUrl)
        ?.albumImageUrl,
      persistToLibrary: input.persistToLibrary,
      onProgress: options?.onProgress,
    });

    try {
      await this.usageStats.recordMix({
        userId: user.id,
        kind: 'genre',
        seeds: genres.map((genre) => ({
          kind: 'genre' as const,
          seedKey: genre.id,
          name: genre.name,
          imageUrl: coverCandidates.get(genreTrackGroupKey(genre.id)) ?? null,
        })),
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

  private resolveGenres(genreIds: string[]): CuratedGenre[] {
    if (genreIds.length > MAX_GENRES) {
      throw BusinessRuleError.tooManyGenres(genreIds.length);
    }

    const resolved: CuratedGenre[] = [];
    const seen = new Set<string>();

    for (const raw of genreIds) {
      const found = findCuratedGenre(raw);
      if (!found) {
        continue;
      }
      if (seen.has(found.id)) continue;
      seen.add(found.id);
      resolved.push(found);
    }

    return resolved;
  }
}
