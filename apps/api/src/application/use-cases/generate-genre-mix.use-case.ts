import { Inject, Injectable } from '@nestjs/common';
import { GenreMixRequestSchema } from '@blendify/contracts';
import {
  CATALOG_PROVIDER_FACTORY,
  type CatalogProviderFactoryPort,
} from '../../domain/repositories/catalog-provider.port';
import { GeneratedPlaylist } from '../../domain/playlist/generated-playlist';
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
import {
  GenerationProgressTracker,
  type ProgressReporter,
} from '../services/generation-progress.tracker';

const GenerateGenreMixSchema = GenreMixRequestSchema.omit({
  coverImageBase64: true,
  persistToLibrary: true,
}).extend({
  market: z.string().optional(),
});

type GenerateGenreMixDto = z.input<typeof GenerateGenreMixSchema>;

@Injectable()
export class GenerateGenreMixUseCase {
  private readonly generation = new GenrePlaylistGenerationService();

  constructor(
    @Inject(CATALOG_PROVIDER_FACTORY)
    private readonly catalogs: CatalogProviderFactoryPort,
    private readonly genreTrackCatalog: GenreTrackCatalogService,
  ) {}

  async execute(
    raw: GenerateGenreMixDto,
    options?: { onProgress?: ProgressReporter },
  ): Promise<GeneratedPlaylist> {
    const input = GenerateGenreMixSchema.parse(raw);
    const tracker = new GenerationProgressTracker(options?.onProgress);

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
    return GeneratedPlaylist.create({
      name: playlistName,
      description: playlistDescription,
      generation: {
        version: 1,
        kind: 'genre_mix',
        tracksPerSeed: input.tracksPerSeed,
        seeds: genres.map(({ id, name }) => ({ id, name })),
        popularity: input.popularity,
        orderMode: input.orderMode,
      },
      seeds,
      tracks,
      coverCandidateUrl: tracks.find((track) => track.albumImageUrl)
        ?.albumImageUrl,
    });
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
