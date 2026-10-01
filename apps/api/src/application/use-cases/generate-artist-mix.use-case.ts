import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type PlaylistGeneration,
  type PlaylistSeedDto,
  type PopularityMode as PopularityModeValue,
} from '@blendify/contracts';
import {
  CATALOG_MATCH_SEARCH_LIMIT,
  CATALOG_PROVIDER_FACTORY,
  type CatalogProviderFactoryPort,
  type CatalogProviderPort,
} from '@/domain/repositories/catalog-provider.port';
import {
  PROVIDER_QUOTA,
  type ProviderQuotaPort,
} from '@/domain/repositories/provider-quota.port';
import {
  DISCOVERY_CATALOG,
  type DiscoveryCatalogPort,
} from '@/domain/repositories/discovery-catalog.port';
import { PlaylistGenerationService } from '@/domain/services/playlist-generation.service';
import {
  GeneratedPlaylist,
  pickLinkedCoverArtwork,
  trackCoverSource,
} from '@/domain/playlist/generated-playlist';
import { Artist } from '@/domain/artist/artist.entity';
import { pickBestArtistMatch } from '@/domain/artist/artist-name-match';
import { ArtistId } from '@/domain/value-objects/artist-id.vo';
import { Track } from '@/domain/track/track.entity';
import {
  AcceptedTrackPool,
  type TrackAcceptance,
} from '@/domain/services/accepted-track-pool';
import { BusinessRuleError } from '@/domain/errors/business-rule.error';
import { CatalogUnavailableError } from '@/domain/errors/catalog-unavailable.error';
import { MAX_TRACKS, maxTracksPerSeedForCount } from '@/domain/constants';
import {
  isFatalCatalogError,
  isSpotifyQuotaError,
  resolveChartIntoPool,
  seedResolveAttemptLimit,
} from '@/domain/genre/catalog-resolve';
import {
  CatalogChartCursor,
  type CatalogTrackRef,
} from '@/domain/genre/catalog-window';
import {
  buildDefaultPlaylistDescription,
  buildDefaultPlaylistName,
} from '@/domain/playlist/default-playlist-name';
import {
  GenerateArtistMixDto,
  GenerateArtistMixSchema,
} from '@/application/dto/generate-artist-mix.dto';
import {
  GenerationProgressTracker,
  type ProgressReporter,
} from '@/application/services/generation-progress.tracker';
import {
  hasTrackSelectionFilters,
  trackSelectionFilters,
  withTrackSelectionFilters,
} from '@/domain/selection-filters/track-selection-filters';

const PER_ARTIST_FETCH_OVER_FETCH = 3;
const ARTIST_CHART_TRACK_LIMIT = 50;

type ArtistSourceAcceptance = {
  acceptTrack?: TrackAcceptance;
  /**
   * Hard track filters reject resolved candidates, so a filtered mix keeps
   * resolving the already loaded chart (bounded by its length) instead of
   * stopping at the unfiltered over-fetch budget.
   */
  exhaustChart: boolean;
};

type ArtistTrackSource = {
  artist: Artist;
  exhaustChart: boolean;
  pool: AcceptedTrackPool;
  /** `undefined` until loaded; `null` when no chart is usable. */
  chart: CatalogChartCursor<CatalogTrackRef> | null | undefined;
  attempted: number;
  searched: boolean;
  exhausted: boolean;
};

function isPendingArtistId(id: string): boolean {
  return id.startsWith('pending:');
}

@Injectable()
export class GenerateArtistMixUseCase {
  private readonly generation = new PlaylistGenerationService();
  private readonly logger = new Logger(GenerateArtistMixUseCase.name);

  constructor(
    @Inject(CATALOG_PROVIDER_FACTORY)
    private readonly catalogs: CatalogProviderFactoryPort,
    @Inject(PROVIDER_QUOTA) private readonly quota: ProviderQuotaPort,
    @Inject(DISCOVERY_CATALOG)
    private readonly discoveryCatalog: DiscoveryCatalogPort,
  ) {}

  async execute(
    raw: GenerateArtistMixDto,
    options?: { onProgress?: ProgressReporter; acceptTrack?: TrackAcceptance },
  ): Promise<GeneratedPlaylist> {
    const input = GenerateArtistMixSchema.parse(raw);
    const tracker = new GenerationProgressTracker(options?.onProgress);

    this.quota.assertAvailable();

    const catalog = this.catalogs.forMarket(input.market);
    const artists = await this.resolveArtists(
      catalog,
      input.artistIds,
      input.artists,
      tracker,
    );
    const maxPerArtist = maxTracksPerSeedForCount(artists.length);
    if (input.tracksPerSeed > maxPerArtist) {
      throw BusinessRuleError.trackBudgetExceeded(
        'artist',
        maxPerArtist,
        artists.length,
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

    const trackFilters = trackSelectionFilters(input.filters);
    const tracksByArtist = await this.fetchTracksForMix(
      catalog,
      artists,
      input.tracksPerSeed,
      input.popularity,
      tracker,
      input.maxTracks,
      {
        acceptTrack: withTrackSelectionFilters(
          trackFilters,
          options?.acceptTrack,
        ),
        exhaustChart: hasTrackSelectionFilters(trackFilters),
      },
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
        filters: input.filters,
        popularity: input.popularity,
        orderMode: input.orderMode,
      } satisfies PlaylistGeneration);
    return GeneratedPlaylist.create({
      name: playlistName,
      description: playlistDescription,
      generation,
      seeds,
      tracks,
      coverArtwork: pickLinkedCoverArtwork([
        ...artists.map((artist) => ({
          imageUrl: artist.imageUrl,
          spotifyUrl: artist.externalUrl,
        })),
        ...tracks.map(trackCoverSource),
      ]),
    });
  }

  private async resolveArtists(
    catalog: CatalogProviderPort,
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
        ? await catalog.getArtistsByIds(spotifyIdsToFetch)
        : [];
    const fetchedById = new Map(
      fetched.map((artist) => [artist.id.getValue(), artist] as const),
    );

    const artists: Artist[] = [];
    const seen = new Set<string>();
    let index = 0;

    for (const id of artistIds) {
      index += 1;
      const resolved = isPendingArtistId(id)
        ? await this.resolvePendingArtist(catalog, id, fromClient)
        : this.resolveKnownArtist(id, fromClient, fetchedById);

      if (!resolved) {
        tracker?.report('resolving_seeds', index, artistIds.length);
        continue;
      }

      const spotifyId = resolved.id.getValue();
      if (seen.has(spotifyId)) {
        tracker?.report('resolving_seeds', index, artistIds.length);
        continue;
      }
      seen.add(spotifyId);
      artists.push(resolved);
      tracker?.report('resolving_seeds', index, artistIds.length);
    }

    if (artists.length === 0) {
      throw BusinessRuleError.emptyArtistSelection();
    }
    return artists;
  }

  private async resolvePendingArtist(
    catalog: CatalogProviderPort,
    id: string,
    fromClient: Map<
      string,
      { id: string; name: string; imageUrl?: string | null }
    >,
  ): Promise<Artist> {
    const snapshot = fromClient.get(id);
    const name = snapshot?.name?.trim();
    if (!name) {
      throw new BusinessRuleError(
        'Pending artist is missing a name.',
        'ARTIST_RESOLVE_FAILED',
        { id },
      );
    }
    const matches = await catalog.searchArtists(name, 3);
    const best = pickBestArtistMatch(name, matches);
    if (!best) {
      throw new BusinessRuleError(
        `Could not find Spotify artist for "${name}".`,
        'ARTIST_RESOLVE_FAILED',
        { name },
      );
    }
    return best;
  }

  private resolveKnownArtist(
    id: string,
    fromClient: Map<
      string,
      { id: string; name: string; imageUrl?: string | null }
    >,
    fetchedById: Map<string, Artist>,
  ): Artist | undefined {
    const snapshot = fromClient.get(id);
    if (snapshot) {
      return Artist.create({
        id: ArtistId.create(snapshot.id),
        name: snapshot.name,
        imageUrl: snapshot.imageUrl ?? undefined,
      });
    }
    return fetchedById.get(id);
  }

  private async fetchTracksForMix(
    catalog: CatalogProviderPort,
    artists: Artist[],
    tracksPerSeed: number,
    mode: PopularityModeValue,
    tracker?: GenerationProgressTracker,
    maxTracks?: number,
    acceptance: ArtistSourceAcceptance = { exhaustChart: false },
  ): Promise<Map<string, Track[]>> {
    const totalNeeded = Math.min(
      artists.length * tracksPerSeed,
      maxTracks ?? MAX_TRACKS,
    );
    const sources = artists.map((artist) =>
      this.createArtistSource(artist, acceptance),
    );
    const reportMatched = () => {
      tracker?.report(
        'matching_tracks',
        Math.min(totalNeeded, sumPoolSizes(sources)),
        Math.max(1, totalNeeded),
      );
    };
    reportMatched();

    // Small over-fetch first; a seed that runs dry is topped up below.
    const fetchBudget = Math.min(
      MAX_TRACKS,
      tracksPerSeed + PER_ARTIST_FETCH_OVER_FETCH,
    );
    for (const source of sources) {
      this.quota.assertAvailable();
      await this.fillArtistSource(
        catalog,
        source,
        fetchBudget,
        mode,
        reportMatched,
      );
      reportMatched();
    }

    for (const source of sources) {
      const shortfall = totalNeeded - sumPoolSizes(sources);
      if (shortfall <= 0) {
        break;
      }
      if (source.exhausted) {
        continue;
      }
      this.quota.assertAvailable();
      await this.fillArtistSource(
        catalog,
        source,
        Math.min(MAX_TRACKS, source.pool.size + shortfall),
        mode,
        reportMatched,
      );
      reportMatched();
    }

    return new Map(
      sources.map((source) => [
        source.artist.id.getValue(),
        source.pool.tracks,
      ]),
    );
  }

  private createArtistSource(
    artist: Artist,
    { acceptTrack, exhaustChart }: ArtistSourceAcceptance,
  ): ArtistTrackSource {
    return {
      artist,
      exhaustChart,
      pool: new AcceptedTrackPool(0, {
        accepts: (track) =>
          this.trackMatchesArtist(track, artist) &&
          (acceptTrack?.(track) ?? true),
      }),
      chart: undefined,
      attempted: 0,
      searched: false,
      exhausted: false,
    };
  }

  /**
   * Chart pool (popular 0–40% / balanced full / rarities 60–100%), shuffled.
   * If the preferred band underfills, expand toward the rest of the chart.
   * Remaining shortfall → artist search. Resumable: a later call with a larger
   * target continues from the unattempted chart entries.
   */
  private async fillArtistSource(
    catalog: CatalogProviderPort,
    source: ArtistTrackSource,
    target: number,
    mode: PopularityModeValue,
    onMatched?: () => void,
  ): Promise<void> {
    source.pool.growTarget(target);

    await this.fillFromLastFm(catalog, source, mode, onMatched);
    if (!source.pool.isFull && !source.searched) {
      this.quota.assertAvailable();
      source.searched = true;
      await this.appendArtistSearchFallback(catalog, source, onMatched);
    }

    source.exhausted = !source.pool.isFull;
  }

  private async appendArtistSearchFallback(
    catalog: CatalogProviderPort,
    source: ArtistTrackSource,
    onMatched?: () => void,
  ): Promise<void> {
    try {
      const page = await catalog.searchTracks(
        `artist:"${source.artist.name}"`,
        {
          limit: CATALOG_MATCH_SEARCH_LIMIT,
          offset: 0,
        },
      );
      for (const track of page) {
        if (source.pool.offer(track)) {
          onMatched?.();
        }
      }
    } catch (error) {
      if (error instanceof CatalogUnavailableError) {
        throw error;
      }
      if (isSpotifyQuotaError(error)) {
        if (source.pool.size === 0) {
          throw error;
        }
        return;
      }
      this.logger.warn(
        `Artist track search fallback failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async fillFromLastFm(
    catalog: CatalogProviderPort,
    source: ArtistTrackSource,
    mode: PopularityModeValue,
    onMatched?: () => void,
  ): Promise<void> {
    if (!this.discoveryCatalog.isConfigured() || source.chart === null) {
      return;
    }

    try {
      source.chart ??= await this.loadArtistChart(source.artist, mode);
      if (!source.chart) {
        return;
      }

      source.attempted += await resolveChartIntoPool(
        catalog,
        source.chart,
        source.pool,
        {
          concurrency: 1,
          artistId: source.artist.id.getValue(),
          maxAttempts: source.exhaustChart
            ? undefined
            : seedResolveAttemptLimit(source.pool.target) - source.attempted,
          onProgress: () => onMatched?.(),
        },
      );
    } catch (error) {
      if (isFatalCatalogError(error)) {
        throw error;
      }
      this.logger.warn(`Last.fm track fetch failed: ${errorMessage(error)}`);
      source.chart = null;
    }
  }

  private async loadArtistChart(
    artist: Artist,
    mode: PopularityModeValue,
  ): Promise<CatalogChartCursor<CatalogTrackRef> | null> {
    const chart = await this.discoveryCatalog.getTopTracksForArtist(
      { name: artist.name },
      ARTIST_CHART_TRACK_LIMIT,
    );
    if (chart.length === 0) {
      return null;
    }

    return new CatalogChartCursor(
      chart.map((entry) => ({ ...entry, artistName: artist.name })),
      mode,
    );
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

function sumPoolSizes(sources: readonly ArtistTrackSource[]): number {
  return sources.reduce((total, source) => total + source.pool.size, 0);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
