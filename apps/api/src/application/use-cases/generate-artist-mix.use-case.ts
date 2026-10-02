import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PopularityMode,
  type PlaylistGeneration,
  type PlaylistSeedDto,
  type PopularityMode as PopularityModeValue,
  type ReleaseRange,
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
import { CatalogWorkBudgetExhaustedError } from '@/domain/errors/catalog-work-budget.error';
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
import {
  ARTIST_MIX_WORK_POLICY,
  bindCatalogWorkBudget,
  createCoverageFirstWorkBudget,
  initialCoverageQuotas,
  planCoverageFirstBoundedWork,
  type ArtistMixWorkPolicy,
  type CoverageFirstResolveTranche,
} from './artist-mix-work-policy';

const PER_ARTIST_FETCH_OVER_FETCH = 3;
const ARTIST_CHART_TRACK_LIMIT = 50;

type ClosedReleaseSpan = {
  fromYear: number;
  toYear: number;
};

type ArtistSourceAcceptance = {
  acceptTrack?: TrackAcceptance;
  /**
   * Live-only filtering can walk the loaded chart. A closed release range
   * does not: Last.fm has no year, so that walk stays inside the normal
   * attempt limit after the year-aware search.
   */
  exhaustChart: boolean;
  releaseSpan?: ClosedReleaseSpan | null;
};

const UNFILTERED_ARTIST_SOURCE_ACCEPTANCE: ArtistSourceAcceptance = {
  exhaustChart: false,
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
  chartExhausted: boolean;
  fallbackPage?: Track[];
  releaseSpan: ClosedReleaseSpan | null;
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
    options?: {
      onProgress?: ProgressReporter;
      acceptTrack?: TrackAcceptance;
      workPolicy?: ArtistMixWorkPolicy;
    },
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
    const releaseSpan = closedReleaseSpan(trackFilters.releaseRange);
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
        exhaustChart:
          hasTrackSelectionFilters(trackFilters) && releaseSpan === null,
        releaseSpan,
      },
      options?.workPolicy,
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
    acceptance: ArtistSourceAcceptance = UNFILTERED_ARTIST_SOURCE_ACCEPTANCE,
    workPolicy?: ArtistMixWorkPolicy,
  ): Promise<Map<string, Track[]>> {
    if (workPolicy === ARTIST_MIX_WORK_POLICY.COVERAGE_FIRST_BOUNDED) {
      return this.fetchTracksCoverageFirst(
        catalog,
        artists,
        tracksPerSeed,
        mode,
        tracker,
        maxTracks,
        acceptance,
      );
    }

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
      acceptance.releaseSpan
        ? tracksPerSeed
        : tracksPerSeed + PER_ARTIST_FETCH_OVER_FETCH,
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

  private async fetchTracksCoverageFirst(
    catalog: CatalogProviderPort,
    artists: Artist[],
    tracksPerSeed: number,
    mode: PopularityModeValue,
    tracker?: GenerationProgressTracker,
    maxTracks?: number,
    acceptance: ArtistSourceAcceptance = UNFILTERED_ARTIST_SOURCE_ACCEPTANCE,
  ): Promise<Map<string, Track[]>> {
    const totalNeeded = Math.min(
      artists.length * tracksPerSeed,
      maxTracks ?? MAX_TRACKS,
    );
    const quotas = initialCoverageQuotas(artists.length, totalNeeded);
    const budget = createCoverageFirstWorkBudget(
      planCoverageFirstBoundedWork({
        totalNeeded,
        sourceCount: artists.length,
      }),
    );
    const phase: { current: CoverageFirstResolveTranche } = {
      current: 'coverage',
    };
    const guarded = bindCatalogWorkBudget(catalog, budget, () => phase.current);
    const sources = artists.map((artist, index) => {
      const source = this.createArtistSource(artist, {
        acceptTrack: acceptance.acceptTrack,
        exhaustChart: false,
        releaseSpan: acceptance.releaseSpan,
      });
      source.pool.growTarget(quotas[index] ?? 0);
      return source;
    });
    const reportMatched = () => {
      tracker?.report(
        'matching_tracks',
        Math.min(totalNeeded, sumPoolSizes(sources)),
        Math.max(1, totalNeeded),
      );
    };
    reportMatched();

    const chartMode = acceptance.releaseSpan ? PopularityMode.BALANCED : mode;
    if (acceptance.releaseSpan) {
      await this.primeClosedReleaseSearches(
        guarded,
        sources,
        quotas,
        totalNeeded,
        acceptance.releaseSpan,
        reportMatched,
      );
      if (sumPoolSizes(sources) >= totalNeeded) {
        return tracksByArtist(sources);
      }
    }

    await this.coverSourcesRoundRobin(
      guarded,
      sources,
      quotas,
      budget,
      chartMode,
      reportMatched,
    );
    if (!acceptance.releaseSpan) {
      await this.fallbackInsufficientSources(
        guarded,
        sources,
        quotas,
        budget,
        reportMatched,
      );
    }
    phase.current = 'redistribution';
    await this.expandSourcesRoundRobin(
      guarded,
      sources,
      quotas,
      totalNeeded,
      budget,
      chartMode,
      reportMatched,
    );

    return tracksByArtist(sources);
  }

  private async primeClosedReleaseSearches(
    catalog: CatalogProviderPort,
    sources: ArtistTrackSource[],
    quotas: readonly number[],
    totalNeeded: number,
    span: ClosedReleaseSpan,
    reportMatched: () => void,
  ): Promise<void> {
    for (const [index, source] of sources.entries()) {
      if (sumPoolSizes(sources) >= totalNeeded) {
        break;
      }
      if (source.pool.size >= (quotas[index] ?? 0) || source.searched) {
        continue;
      }

      this.quota.assertAvailable();
      await this.searchAndCacheFallback(
        catalog,
        source,
        artistYearSearchQuery(source.artist.name, span),
      );
      drainFallbackPage(source, reportMatched);
    }
  }

  private async coverSourcesRoundRobin(
    catalog: CatalogProviderPort,
    sources: ArtistTrackSource[],
    quotas: readonly number[],
    budget: ReturnType<typeof createCoverageFirstWorkBudget>,
    mode: PopularityModeValue,
    reportMatched: () => void,
  ): Promise<void> {
    let progressed = true;
    while (progressed && budget.coverageResolvesRemaining > 0) {
      progressed = false;
      if (
        sources.every(
          (source, index) => source.pool.size >= (quotas[index] ?? 0),
        )
      ) {
        break;
      }

      for (const [index, source] of sources.entries()) {
        if (
          source.pool.size >= (quotas[index] ?? 0) ||
          source.chart === null ||
          source.chartExhausted
        ) {
          continue;
        }
        if (budget.coverageResolvesRemaining <= 0) {
          break;
        }
        this.quota.assertAvailable();
        const before = source.attempted;
        await this.resolveOneFromChart(catalog, source, mode, reportMatched);
        if (source.attempted !== before) {
          progressed = true;
        }
      }
    }
  }

  private async fallbackInsufficientSources(
    catalog: CatalogProviderPort,
    sources: ArtistTrackSource[],
    quotas: readonly number[],
    budget: ReturnType<typeof createCoverageFirstWorkBudget>,
    reportMatched: () => void,
  ): Promise<void> {
    for (const [index, source] of sources.entries()) {
      if (source.pool.size >= (quotas[index] ?? 0)) {
        continue;
      }
      if (source.fallbackPage) {
        drainFallbackPage(source, reportMatched);
        continue;
      }
      if (source.searched || budget.searchesRemaining <= 0) {
        continue;
      }
      this.quota.assertAvailable();
      await this.searchAndCacheFallback(catalog, source);
      drainFallbackPage(source, reportMatched);
    }
  }

  private async expandSourcesRoundRobin(
    catalog: CatalogProviderPort,
    sources: ArtistTrackSource[],
    quotas: readonly number[],
    totalNeeded: number,
    budget: ReturnType<typeof createCoverageFirstWorkBudget>,
    mode: PopularityModeValue,
    reportMatched: () => void,
  ): Promise<void> {
    let progressed = true;
    while (progressed && sumPoolSizes(sources) < totalNeeded) {
      progressed = false;
      const underQuota = sources.filter(
        (source, index) =>
          source.pool.size < (quotas[index] ?? 0) && sourceCanGrow(source),
      );
      const candidates =
        underQuota.length > 0
          ? underQuota
          : sources.filter((source) => sourceCanGrow(source));
      if (candidates.length === 0) {
        break;
      }

      for (const source of candidates) {
        if (sumPoolSizes(sources) >= totalNeeded) {
          break;
        }
        if (source.pool.isFull) {
          source.pool.growTarget(source.pool.size + 1);
        }
        if (drainFallbackPage(source, reportMatched)) {
          progressed = true;
          continue;
        }
        if (budget.redistributionResolvesRemaining <= 0) {
          continue;
        }
        this.quota.assertAvailable();
        const attemptedBefore = source.attempted;
        const sizeBefore = source.pool.size;
        await this.resolveOneFromChart(catalog, source, mode, reportMatched);
        if (
          source.attempted !== attemptedBefore ||
          source.pool.size !== sizeBefore
        ) {
          progressed = true;
        }
      }
    }
  }

  private async resolveOneFromChart(
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

      const added = await resolveChartIntoPool(
        catalog,
        source.chart,
        source.pool,
        {
          concurrency: 1,
          artistId: source.artist.id.getValue(),
          maxAttempts: 1,
          onProgress: () => onMatched?.(),
        },
      );
      source.attempted += added;
      if (added === 0) {
        source.chartExhausted = true;
      }
    } catch (error) {
      if (error instanceof CatalogWorkBudgetExhaustedError) {
        return;
      }
      if (isFatalCatalogError(error)) {
        throw error;
      }
      this.logger.warn(`Last.fm track fetch failed: ${errorMessage(error)}`);
      source.chart = null;
    }
  }

  private async searchAndCacheFallback(
    catalog: CatalogProviderPort,
    source: ArtistTrackSource,
    query = `artist:"${source.artist.name}"`,
  ): Promise<void> {
    source.searched = true;
    try {
      source.fallbackPage = await catalog.searchTracks(query, {
        limit: CATALOG_MATCH_SEARCH_LIMIT,
        offset: 0,
      });
    } catch (error) {
      source.fallbackPage = [];
      if (error instanceof CatalogUnavailableError) {
        throw error;
      }
      if (error instanceof CatalogWorkBudgetExhaustedError) {
        return;
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

  private createArtistSource(
    artist: Artist,
    { acceptTrack, exhaustChart, releaseSpan }: ArtistSourceAcceptance,
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
      chartExhausted: false,
      releaseSpan: releaseSpan ?? null,
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

    if (source.releaseSpan) {
      await this.fillReleaseRangeSource(catalog, source, onMatched);
      source.exhausted = !source.pool.isFull;
      return;
    }

    await this.fillFromLastFm(catalog, source, mode, onMatched);
    if (!source.pool.isFull && !source.searched) {
      this.quota.assertAvailable();
      source.searched = true;
      await this.appendArtistSearchFallback(catalog, source, onMatched);
    }

    source.exhausted = !source.pool.isFull;
  }

  private async fillReleaseRangeSource(
    catalog: CatalogProviderPort,
    source: ArtistTrackSource,
    onMatched?: () => void,
  ): Promise<void> {
    const span = source.releaseSpan;
    if (!span) {
      return;
    }

    if (!source.searched) {
      this.quota.assertAvailable();
      await this.searchAndCacheFallback(
        catalog,
        source,
        artistYearSearchQuery(source.artist.name, span),
      );
      drainFallbackPage(source, onMatched);
    }

    if (!source.pool.isFull) {
      await this.fillFromLastFm(
        catalog,
        source,
        PopularityMode.BALANCED,
        onMatched,
      );
    }
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

function tracksByArtist(
  sources: readonly ArtistTrackSource[],
): Map<string, Track[]> {
  return new Map(
    sources.map((source) => [source.artist.id.getValue(), source.pool.tracks]),
  );
}

function closedReleaseSpan(
  range: ReleaseRange | null,
): ClosedReleaseSpan | null {
  if (range?.fromYear === undefined || range.toYear === undefined) {
    return null;
  }
  return { fromYear: range.fromYear, toYear: range.toYear };
}

function artistYearSearchQuery(
  artistName: string,
  span: ClosedReleaseSpan,
): string {
  return `artist:"${artistName}" year:${span.fromYear}-${span.toYear}`;
}

function sumPoolSizes(sources: readonly ArtistTrackSource[]): number {
  return sources.reduce((total, source) => total + source.pool.size, 0);
}

function sourceCanGrow(source: ArtistTrackSource): boolean {
  if (source.fallbackPage && source.fallbackPage.length > 0) {
    return true;
  }
  return source.chart !== null && !source.chartExhausted;
}

function drainFallbackPage(
  source: ArtistTrackSource,
  onMatched?: () => void,
): boolean {
  if (!source.fallbackPage || source.fallbackPage.length === 0) {
    return false;
  }

  const remaining: Track[] = [];
  let offered = false;
  for (const track of source.fallbackPage) {
    if (source.pool.isFull) {
      remaining.push(track);
      continue;
    }
    if (source.pool.offer(track)) {
      offered = true;
      onMatched?.();
    }
  }
  source.fallbackPage = remaining;
  return offered;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
