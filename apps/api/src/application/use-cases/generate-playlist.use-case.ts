import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  PopularityMode,
  type PlaylistDetail,
  type PlaylistGeneration,
  type PlaylistSeedDto,
  type PopularityMode as PopularityModeValue,
} from '@blendify/contracts';
import type { MusicProviderPort } from '../../domain/repositories/music-provider.port';
import {
  MUSIC_PROVIDER_FACTORY,
  type MusicProviderFactoryPort,
} from '../../domain/repositories/music-provider.factory.port';
import {
  PROVIDER_QUOTA,
  type ProviderQuotaPort,
} from '../../domain/repositories/provider-quota.port';
import {
  DISCOVERY_CATALOG,
  type DiscoveryCatalogPort,
} from '../../domain/repositories/discovery-catalog.port';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
} from '../../domain/repositories/user.repository.port';
import {
  USAGE_STATS_REPOSITORY,
  UsageStatsRepositoryPort,
} from '../../domain/repositories/usage-stats.repository.port';
import { PlaylistGenerationService } from '../../domain/services/playlist-generation.service';
import { Playlist } from '../../domain/playlist/playlist.entity';
import { Artist } from '../../domain/artist/artist.entity';
import { pickBestArtistMatch } from '../../domain/artist/artist-name-match';
import { ArtistId } from '../../domain/value-objects/artist-id.vo';
import { Track } from '../../domain/track/track.entity';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import { MAX_TRACKS, maxTracksPerSeedForCount } from '../../domain/constants';
import {
  preferPopularTracks,
  preferRareTracks,
  rankTracksForMix,
  type ArtistTrackQuery,
} from '../../domain/genre/artist-mix-queries';
import {
  isSpotifyQuotaError,
  resolveCatalogWithPoolExpand,
} from '../../domain/genre/catalog-resolve';
import {
  buildDefaultPlaylistDescription,
  buildDefaultPlaylistName,
} from '../../domain/playlist/default-playlist-name';
import {
  GeneratePlaylistDto,
  GeneratePlaylistSchema,
} from '../dto/generate-playlist.dto';
import { PublishPlaylistService } from '../services/publish-playlist.service';
import {
  GenerationProgressTracker,
  type ProgressReporter,
} from '../services/generation-progress.tracker';

function isPendingArtistId(id: string): boolean {
  return id.startsWith('pending:');
}

/** Popularity ceiling used when preferring rarer chart tracks. */
const RARITY_POPULARITY_CEILING = 55;

function rankModeForPopularity(
  mode: PopularityModeValue,
): ArtistTrackQuery['rank'] {
  if (mode === PopularityMode.POPULAR) return 'popularity_desc';
  if (mode === PopularityMode.RARITIES) return 'popularity_asc';
  return 'as_found';
}

@Injectable()
export class GeneratePlaylistUseCase {
  private readonly generation = new PlaylistGenerationService();
  private readonly logger = new Logger(GeneratePlaylistUseCase.name);

  constructor(
    @Inject(MUSIC_PROVIDER_FACTORY)
    private readonly providers: MusicProviderFactoryPort,
    @Inject(PROVIDER_QUOTA) private readonly quota: ProviderQuotaPort,
    @Inject(DISCOVERY_CATALOG)
    private readonly discoveryCatalog: DiscoveryCatalogPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(USAGE_STATS_REPOSITORY)
    private readonly usageStats: UsageStatsRepositoryPort,
    private readonly publisher: PublishPlaylistService,
  ) {}

  async execute(
    raw: GeneratePlaylistDto,
    options?: { onProgress?: ProgressReporter },
  ): Promise<PlaylistDetail> {
    const input = GeneratePlaylistSchema.parse(raw);
    const tracker = new GenerationProgressTracker(options?.onProgress);
    const user = await this.users.findById(input.userId);
    if (!user) {
      throw new BusinessRuleError('User not found', 'USER_NOT_FOUND');
    }

    this.quota.assertAvailable();

    const provider = this.providers.forUser(input.userId);
    const artists = await this.resolveArtists(
      provider,
      input.artistIds,
      input.artists,
      tracker,
    );
    const maxPerArtist = maxTracksPerSeedForCount(artists.length);
    if (input.tracksPerSeed > maxPerArtist) {
      throw new BusinessRuleError(
        `At most ${maxPerArtist} tracks per artist for ${artists.length} artist(s) (cap ${MAX_TRACKS}).`,
        'TRACK_BUDGET_EXCEEDED',
      );
    }

    const seedNames = artists.map((a) => a.name);
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

    const tracksByArtist = await this.fetchTracksForMix(
      provider,
      artists,
      input.tracksPerSeed,
      input.popularity,
      tracker,
      input.maxTracks,
    );

    const { tracks } = this.generation.generate(
      tracksByArtist,
      input.tracksPerSeed,
      input.orderMode,
      input.maxTracks,
    );

    if (tracks.length === 0) {
      this.quota.assertAvailable();
      throw BusinessRuleError.noTracksFound({
        names: artists.map((a) => a.name),
        popularity: input.popularity,
        source: 'artists',
      });
    }

    const seeds: PlaylistSeedDto[] =
      input.displaySeeds ??
      artists.map((artist) => ({
        type: 'artist',
        id: artist.id.getValue(),
        name: artist.name,
        imageUrl: artist.imageUrl ?? null,
      }));
    const generation: PlaylistGeneration =
      input.generation ??
      ({
        version: 1,
        kind: 'artist_mix',
        tracksPerSeed: input.tracksPerSeed,
        seeds: artists.map((artist) => ({
          id: artist.id.getValue(),
          name: artist.name,
          imageUrl: artist.imageUrl ?? null,
        })),
        popularity: input.popularity,
        orderMode: input.orderMode,
      } satisfies PlaylistGeneration);
    const playlist = Playlist.create({
      id: randomUUID(),
      userId: user.id,
      name: playlistName,
      description: playlistDescription,
      seeds,
      tracks,
      generation,
    });
    const response = await this.publisher.execute({
      playlist,
      provider,
      spotifyUserId: user.spotifyId,
      coverImageBase64: input.coverImageBase64,
      fallbackImageUrl:
        artists.find((artist) => artist.imageUrl)?.imageUrl ??
        tracks.find((track) => track.albumImageUrl)?.albumImageUrl,
      persistToLibrary: input.persistToLibrary,
      onProgress: options?.onProgress,
    });

    try {
      const statsSeeds =
        input.usageSeeds && input.usageSeeds.length > 0
          ? input.usageSeeds.map((seed) => ({
              kind: 'artist' as const,
              seedKey: seed.id,
              name: seed.name,
              imageUrl: seed.imageUrl ?? null,
            }))
          : artists.map((artist) => ({
              kind: 'artist' as const,
              seedKey: artist.id.getValue(),
              name: artist.name,
              imageUrl: artist.imageUrl ?? null,
            }));
      await this.usageStats.recordMix({
        userId: user.id,
        kind: 'artist',
        seeds: statsSeeds,
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

  private async resolveArtists(
    provider: MusicProviderPort,
    artistIds: string[],
    snapshots?: Array<{ id: string; name: string; imageUrl?: string | null }>,
    tracker?: GenerationProgressTracker,
  ): Promise<Artist[]> {
    const fromClient = new Map(
      (snapshots ?? []).map((s) => [s.id, s] as const),
    );

    const spotifyIdsToFetch = artistIds.filter(
      (id) => !isPendingArtistId(id) && !fromClient.has(id),
    );
    tracker?.report('resolving_seeds', 0, Math.max(1, artistIds.length));
    const fetched =
      spotifyIdsToFetch.length > 0
        ? await provider.getArtistsByIds(spotifyIdsToFetch)
        : [];
    const fetchedById = new Map(
      fetched.map((artist) => [artist.id.getValue(), artist] as const),
    );

    const artists: Artist[] = [];
    const seen = new Set<string>();
    let index = 0;

    for (const id of artistIds) {
      index += 1;
      if (isPendingArtistId(id)) {
        const snapshot = fromClient.get(id);
        const name = snapshot?.name?.trim();
        if (!name) {
          throw new BusinessRuleError(
            'Pending artist is missing a name.',
            'ARTIST_RESOLVE_FAILED',
            { id },
          );
        }
        const matches = await provider.searchArtists(name, 3);
        const best = pickBestArtistMatch(name, matches);
        if (!best) {
          throw new BusinessRuleError(
            `Could not find Spotify artist for "${name}".`,
            'ARTIST_RESOLVE_FAILED',
            { name },
          );
        }
        const spotifyId = best.id.getValue();
        if (seen.has(spotifyId)) {
          tracker?.report('resolving_seeds', index, artistIds.length);
          continue;
        }
        seen.add(spotifyId);
        artists.push(best);
        tracker?.report('resolving_seeds', index, artistIds.length);
        continue;
      }

      const snapshot = fromClient.get(id);
      const artist = snapshot
        ? Artist.create({
            id: ArtistId.create(snapshot.id),
            name: snapshot.name,
            imageUrl: snapshot.imageUrl ?? undefined,
          })
        : fetchedById.get(id);

      if (!artist) {
        tracker?.report('resolving_seeds', index, artistIds.length);
        continue;
      }
      const spotifyId = artist.id.getValue();
      if (seen.has(spotifyId)) {
        tracker?.report('resolving_seeds', index, artistIds.length);
        continue;
      }
      seen.add(spotifyId);
      artists.push(artist);
      tracker?.report('resolving_seeds', index, artistIds.length);
    }

    if (artists.length === 0) {
      throw BusinessRuleError.emptyArtistSelection();
    }
    return artists;
  }

  private async fetchTracksForMix(
    provider: MusicProviderPort,
    artists: Artist[],
    tracksPerSeed: number,
    mode: PopularityModeValue,
    tracker?: GenerationProgressTracker,
    maxTracks?: number,
  ): Promise<Map<string, Track[]>> {
    const map = new Map<string, Track[]>();
    const totalNeeded = Math.min(
      artists.length * tracksPerSeed,
      maxTracks ?? artists.length * tracksPerSeed,
    );
    let matched = 0;
    tracker?.report('matching_tracks', 0, Math.max(1, totalNeeded));

    for (const artist of artists) {
      this.quota.assertAvailable();

      const artistId = artist.id.getValue();
      const baseMatched = matched;
      // Small over-fetch so a shortfall on one seed can be topped up from others.
      const fetchBudget = Math.min(MAX_TRACKS, tracksPerSeed + 3);
      const collected = await this.fetchTracksForArtist(
        provider,
        artist,
        fetchBudget,
        mode,
        (seedMatched) => {
          matched = Math.min(totalNeeded, baseMatched + seedMatched);
          tracker?.report('matching_tracks', matched, Math.max(1, totalNeeded));
        },
      );

      let ranked = rankTracksForMix(collected, rankModeForPopularity(mode));
      if (mode === PopularityMode.POPULAR) {
        ranked = preferPopularTracks(ranked, fetchBudget);
      } else if (mode === PopularityMode.RARITIES) {
        ranked = preferRareTracks(
          ranked,
          fetchBudget,
          RARITY_POPULARITY_CEILING,
        );
      }

      matched = Math.min(
        totalNeeded,
        baseMatched + Math.min(ranked.length, tracksPerSeed),
      );
      tracker?.report('matching_tracks', matched, Math.max(1, totalNeeded));
      map.set(artistId, ranked);
    }

    return map;
  }

  /**
   * Chart pool (popular 0–40% / balanced full / rarities 60–100%), shuffled.
   * If the preferred band underfills, expand toward the rest of the chart.
   * Remaining shortfall → artist search.
   */
  private async fetchTracksForArtist(
    provider: MusicProviderPort,
    artist: Artist,
    tracksPerSeed: number,
    mode: PopularityModeValue,
    onMatched?: (matched: number) => void,
  ): Promise<Track[]> {
    const collected = await this.fetchTracksForArtistFromLastFm(
      provider,
      artist,
      tracksPerSeed,
      mode,
      onMatched,
    );

    if (collected.length < tracksPerSeed) {
      this.quota.assertAvailable();
      try {
        const page = await provider.searchTracks(`artist:"${artist.name}"`, {
          limit: 10,
          offset: 0,
        });
        const seen = new Set(collected.map((t) => t.id.getValue()));
        for (const track of page) {
          if (!this.trackMatchesArtist(track, artist)) continue;
          const id = track.id.getValue();
          if (seen.has(id)) continue;
          seen.add(id);
          collected.push(track);
          onMatched?.(Math.min(collected.length, tracksPerSeed));
        }
      } catch (error) {
        if (isSpotifyQuotaError(error)) {
          if (collected.length === 0) throw error;
        } else {
          this.logger.warn(
            `Artist track search fallback failed for ${artist.name}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    return collected;
  }

  private async fetchTracksForArtistFromLastFm(
    provider: MusicProviderPort,
    artist: Artist,
    tracksPerSeed: number,
    mode: PopularityModeValue,
    onMatched?: (matched: number) => void,
  ): Promise<Track[]> {
    if (!this.discoveryCatalog.isConfigured()) return [];

    try {
      const chart = await this.discoveryCatalog.getTopTracksForArtist(
        artist.name,
        50,
      );
      if (chart.length === 0) return [];

      const refs = chart.map((entry) => ({
        ...entry,
        artistName: artist.name,
      }));

      return await resolveCatalogWithPoolExpand(
        provider,
        refs,
        mode,
        tracksPerSeed,
        {
          concurrency: 1,
          artistId: artist.id.getValue(),
          onProgress: (update) => {
            onMatched?.(Math.min(update.matched, tracksPerSeed));
          },
        },
      );
    } catch (error) {
      if (isSpotifyQuotaError(error)) throw error;
      return [];
    }
  }

  private trackMatchesArtist(track: Track, artist: Artist): boolean {
    // Prefer the Spotify id the user picked — name matching pulls homonyms
    // ("Duffy" → "Stephen Duffy" / "Gráinne Duffy").
    if (!isPendingArtistId(artist.id.getValue())) {
      return track.artistId.equals(artist.id);
    }
    return (
      track.artistName.trim().toLowerCase() === artist.name.trim().toLowerCase()
    );
  }
}
