import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PopularityMode, SelectionFilters } from '@blendify/contracts';
import { pickUniqueArtistMatch } from '@/domain/artist/artist-name-match';
import { Artist } from '@/domain/artist/artist.entity';
import { BusinessRuleError } from '@/domain/errors/business-rule.error';
import { CatalogUnavailableError } from '@/domain/errors/catalog-unavailable.error';
import {
  isFatalCatalogError,
  isSpotifyQuotaError,
  resolveCatalogRef,
  resolveChartIntoPool,
  seedResolveAttemptLimit,
} from '@/domain/genre/catalog-resolve';
import { CatalogChartCursor } from '@/domain/genre/catalog-window';
import {
  AcceptedTrackPool,
  type TrackAcceptance,
} from '@/domain/services/accepted-track-pool';
import {
  type CatalogGenre,
  genreTrackGroupKey,
} from '@/domain/genre/genre-catalog';
import { tracksPerSeedArtist } from '@/domain/genre/genre-playlist-generation.service';
import {
  type CatalogTrackCandidate,
  DISCOVERY_CATALOG,
  type DiscoveryCatalogPort,
  type SimilarArtistCandidate,
} from '@/domain/repositories/discovery-catalog.port';
import {
  CATALOG_MATCH_SEARCH_LIMIT,
  type CatalogProviderPort,
} from '@/domain/repositories/catalog-provider.port';
import {
  PROVIDER_QUOTA,
  type ProviderQuotaPort,
} from '@/domain/repositories/provider-quota.port';
import { Track } from '@/domain/track/track.entity';
import { GENRE_MIX_MAX_TRACKS_PER_ARTIST } from '@/domain/genre/genre-generation.constants';
import { RegionalGenreArtistPool } from './regional-genre-artist-pool';

const SPOTIFY_VARIOUS_ARTISTS_ARTIST_ID = '0LyfQWJT6nXafLPZqxe9Of';

const GENRE_TAG_TRACK_CANDIDATE_LIMIT = 100;
const REGIONAL_ARTIST_EXPANSION_LIMIT = 2;
const SEED_ARTIST_FALLBACK_RATIO = 0.35;
const MIN_SEED_ARTIST_FALLBACK_LIMIT = 5;
const MAX_SEED_ARTIST_FALLBACK_LIMIT = 8;
const SEED_ARTIST_CANDIDATE_BUFFER = 4;
const MIN_SEED_ARTIST_CANDIDATE_LIMIT = 10;
const MAX_SEED_ARTIST_CANDIDATE_LIMIT = 16;
const ARTIST_NAME_MATCH_CANDIDATE_LIMIT = 10;
const ARTIST_CHART_TRACK_LIMIT = 50;
const ARTIST_CHART_LOOKUP_CONCURRENCY = 4;

export interface GenreTrackCatalogResult {
  tracksByGenre: Map<string, Track[]>;
  coverCandidates: Map<string, string | undefined>;
}

/** `null` skips this candidate and continues; `'stop'` ends the seed-fanout loop early (quota hit). */
type SeedFanoutOutcome<T> = T | null | 'stop';

type RegionalArtistSource = {
  cursor: CatalogChartCursor<CatalogTrackCandidate>;
  accepted: number;
  exhausted: boolean;
};

@Injectable()
export class GenreTrackCatalogService {
  private readonly logger = new Logger(GenreTrackCatalogService.name);

  constructor(
    @Inject(DISCOVERY_CATALOG)
    private readonly discoveryCatalog: DiscoveryCatalogPort,
    @Inject(PROVIDER_QUOTA) private readonly quota: ProviderQuotaPort,
  ) {}

  async resolve(
    provider: CatalogProviderPort,
    genres: CatalogGenre[],
    popularity: PopularityMode,
    tracksPerSeed: number,
    options?: {
      filters?: SelectionFilters;
      onMatched?: (matched: number) => void;
      acceptTrack?: TrackAcceptance;
    },
  ): Promise<GenreTrackCatalogResult> {
    this.quota.assertAvailable();
    if (!this.discoveryCatalog.isConfigured()) {
      throw BusinessRuleError.genreLookupUnavailable({
        reason: 'not_configured',
      });
    }

    const region = options?.filters?.region ?? null;
    const regionalPool = region
      ? new RegionalGenreArtistPool(this.discoveryCatalog, region, this.logger)
      : null;

    const tracksByGenre = new Map<string, Track[]>();
    const coverCandidates = new Map<string, string | undefined>();
    let matched = 0;
    const totalNeeded = genres.length * tracksPerSeed;
    const claimedKeys = new Set<string>();

    // Serial genre fetches keep Spotify Dev Mode quota usage predictable.
    for (const genre of genres) {
      this.quota.assertAvailable();
      const baseMatched = matched;
      const pool = new AcceptedTrackPool(tracksPerSeed, {
        maxPerArtist: GENRE_MIX_MAX_TRACKS_PER_ARTIST,
        claimedKeys,
        accepts: (track) =>
          !this.isJunkTrack(track) && (options?.acceptTrack?.(track) ?? true),
      });
      const result = await this.resolveGenre(
        provider,
        genre,
        popularity,
        pool,
        regionalPool,
        () => {
          matched = Math.min(totalNeeded, baseMatched + pool.size);
          options?.onMatched?.(matched);
        },
      );
      matched = Math.min(totalNeeded, baseMatched + result.tracks.length);
      options?.onMatched?.(matched);
      tracksByGenre.set(result.genreKey, result.tracks);
      coverCandidates.set(result.genreKey, result.coverUrl);
    }

    if (
      Array.from(tracksByGenre.values()).every((tracks) => tracks.length === 0)
    ) {
      this.quota.assertAvailable();
    }

    return { tracksByGenre, coverCandidates };
  }

  private async resolveGenre(
    provider: CatalogProviderPort,
    genre: CatalogGenre,
    popularity: PopularityMode,
    pool: AcceptedTrackPool,
    regionalPool: RegionalGenreArtistPool | null,
    onMatched: () => void,
  ): Promise<{
    genreKey: string;
    tracks: Track[];
    coverUrl: string | undefined;
  }> {
    const genreKey = genreTrackGroupKey(genre.id);
    const regionalArtists = regionalPool
      ? await this.resolveRegionalArtistTracks(
          provider,
          regionalPool,
          genre.id,
          popularity,
          pool,
          onMatched,
        )
      : null;
    if (!regionalPool) {
      await this.resolveTagTracks(provider, genre, popularity, pool, onMatched);
    }

    let coverUrl: string | undefined;
    if (!pool.isFull) {
      this.quota.assertAvailable();
      coverUrl = await this.resolveSeedArtistTracks(
        provider,
        genre,
        pool,
        regionalArtists,
      );
      onMatched();
    }

    const tracks = pool.tracks;
    if (!coverUrl) {
      coverUrl = tracks.find((track) => track.albumImageUrl)?.albumImageUrl;
    }

    return { genreKey, tracks, coverUrl };
  }

  private async resolveTagTracks(
    provider: CatalogProviderPort,
    genre: CatalogGenre,
    popularity: PopularityMode,
    pool: AcceptedTrackPool,
    onMatched: () => void,
  ): Promise<void> {
    try {
      const chart = await this.discoveryCatalog.getTopTracksForTag(
        genre.id,
        GENRE_TAG_TRACK_CANDIDATE_LIMIT,
      );
      await resolveChartIntoPool(
        provider,
        new CatalogChartCursor(chart, popularity),
        pool,
        { onProgress: onMatched },
      );
    } catch (error) {
      if (isFatalCatalogError(error)) {
        throw error;
      }
      this.logger.warn(`Tag chart resolve failed: ${errorMessage(error)}`);
    }
  }

  /**
   * Explores qualified regional artists progressively: deeper into each
   * artist chart, then further down the regional artist ranking, within one
   * Spotify resolve budget per genre. Never leaves the selected region.
   */
  private async resolveRegionalArtistTracks(
    provider: CatalogProviderPort,
    regionalPool: RegionalGenreArtistPool,
    genreId: string,
    popularity: PopularityMode,
    pool: AcceptedTrackPool,
    onMatched: () => void,
  ): Promise<SimilarArtistCandidate[]> {
    const step = pool.target + SEED_ARTIST_CANDIDATE_BUFFER;
    const sources: RegionalArtistSource[] = [];
    let attemptsLeft = seedResolveAttemptLimit(pool.target);
    let qualified: SimilarArtistCandidate[] = [];

    for (let expansion = 0; ; expansion += 1) {
      const next = await regionalPool.qualifiedArtists(
        genreId,
        step * (expansion + 1),
      );
      if (expansion > 0 && next.length === qualified.length) {
        break;
      }

      const charts = await this.loadArtistCharts(next.slice(qualified.length));
      sources.push(
        ...charts.map((chart) => ({
          cursor: new CatalogChartCursor(chart, popularity),
          accepted: 0,
          exhausted: false,
        })),
      );
      qualified = next;

      attemptsLeft -= await this.resolveRegionalSources(
        provider,
        sources,
        pool,
        attemptsLeft,
        onMatched,
      );
      if (
        pool.isFull ||
        attemptsLeft <= 0 ||
        expansion >= REGIONAL_ARTIST_EXPANSION_LIMIT
      ) {
        break;
      }
    }

    return qualified;
  }

  private async resolveRegionalSources(
    provider: CatalogProviderPort,
    sources: RegionalArtistSource[],
    pool: AcceptedTrackPool,
    maxAttempts: number,
    onMatched: () => void,
  ): Promise<number> {
    let attempted = 0;

    while (!pool.isFull && attempted < maxAttempts) {
      const layer = this.nextRegionalLayer(sources);
      if (layer.length === 0) {
        break;
      }

      for (const { source, entry } of layer) {
        if (pool.isFull || attempted >= maxAttempts) {
          break;
        }
        source.cursor.markAttempted(entry);
        attempted += 1;
        const track = await resolveCatalogRef(provider, entry);
        if (track && pool.offer(track)) {
          source.accepted += 1;
          onMatched();
        }
      }
    }

    return attempted;
  }

  /** One round-robin window per artist: first picks of every artist come first. */
  private nextRegionalLayer(
    sources: RegionalArtistSource[],
  ): Array<{ source: RegionalArtistSource; entry: CatalogTrackCandidate }> {
    const windows = sources.map((source) => {
      const open = GENRE_MIX_MAX_TRACKS_PER_ARTIST - source.accepted;
      if (source.exhausted || open <= 0) {
        return [];
      }
      const window = source.cursor.next(open).slice(0, open);
      source.exhausted = window.length === 0;
      return window.map((entry) => ({ source, entry }));
    });
    const layer: Array<{
      source: RegionalArtistSource;
      entry: CatalogTrackCandidate;
    }> = [];

    for (let round = 0; round < GENRE_MIX_MAX_TRACKS_PER_ARTIST; round += 1) {
      for (const window of windows) {
        const pick = window[round];
        if (pick) {
          layer.push(pick);
        }
      }
    }
    return layer;
  }

  private async loadArtistCharts(
    artists: SimilarArtistCandidate[],
  ): Promise<CatalogTrackCandidate[][]> {
    const charts: CatalogTrackCandidate[][] = [];
    for (
      let start = 0;
      start < artists.length;
      start += ARTIST_CHART_LOOKUP_CONCURRENCY
    ) {
      const batch = artists.slice(
        start,
        start + ARTIST_CHART_LOOKUP_CONCURRENCY,
      );
      charts.push(
        ...(await Promise.all(
          batch.map((artist) => this.loadArtistChart(artist)),
        )),
      );
    }
    return charts;
  }

  private async loadArtistChart(
    artist: SimilarArtistCandidate,
  ): Promise<CatalogTrackCandidate[]> {
    try {
      return await this.discoveryCatalog.getTopTracksForArtist(
        artist,
        ARTIST_CHART_TRACK_LIMIT,
      );
    } catch (error) {
      this.logger.warn(`Artist chart lookup failed: ${errorMessage(error)}`);
      return [];
    }
  }

  /** Returns the cover of the first seed artist when the fallback ran. */
  private async resolveSeedArtistTracks(
    provider: CatalogProviderPort,
    genre: CatalogGenre,
    pool: AcceptedTrackPool,
    regionalArtists: SimilarArtistCandidate[] | null,
  ): Promise<string | undefined> {
    // Each fallback seed costs Spotify searches, so cap fan-out tightly and
    // resolve seed artists lazily until the genre target is met.
    const seedLimit = Math.min(
      MAX_SEED_ARTIST_FALLBACK_LIMIT,
      Math.max(
        MIN_SEED_ARTIST_FALLBACK_LIMIT,
        Math.ceil(pool.target * SEED_ARTIST_FALLBACK_RATIO),
      ),
    );
    const candidates = await this.seedArtistCandidates(
      genre,
      seedLimit,
      regionalArtists,
    );
    const tracksPerArtist = tracksPerSeedArtist(pool.target, seedLimit);
    const seen = new Set<string>();
    let resolvedArtists = 0;
    let coverUrl: string | undefined;

    for (const candidate of candidates) {
      if (pool.isFull || resolvedArtists >= seedLimit) {
        break;
      }
      this.quota.assertAvailable();

      const artist = await this.resolveOneSeedArtist(
        provider,
        candidate.name,
        seen,
        pool.size,
      );
      if (artist === 'stop') {
        break;
      }
      if (!artist) {
        continue;
      }
      resolvedArtists += 1;
      if (resolvedArtists === 1) {
        coverUrl = artist.imageUrl;
      }

      this.quota.assertAvailable();
      const page = await this.searchTracksForSeedArtist(
        provider,
        artist,
        pool.size,
      );
      if (page === 'stop') {
        break;
      }
      if (page !== null) {
        this.offerSeedArtistTracks(page, artist, tracksPerArtist, pool);
      }
    }

    return coverUrl;
  }

  private async searchTracksForSeedArtist(
    provider: CatalogProviderPort,
    artist: Artist,
    collectedCount: number,
  ): Promise<SeedFanoutOutcome<Track[]>> {
    try {
      return await provider.searchTracks(`artist:"${artist.name}"`, {
        limit: CATALOG_MATCH_SEARCH_LIMIT,
        offset: 0,
      });
    } catch (error) {
      if (error instanceof CatalogUnavailableError) {
        throw error;
      }
      if (isSpotifyQuotaError(error)) {
        if (collectedCount === 0) {
          throw error;
        }
        return 'stop';
      }
      this.logger.warn(
        `Genre artist search failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private offerSeedArtistTracks(
    page: Track[],
    artist: Artist,
    tracksPerArtist: number,
    pool: AcceptedTrackPool,
  ): void {
    const artistId = artist.id.getValue();
    let offered = 0;

    for (const track of page) {
      if (pool.isFull || offered >= tracksPerArtist) {
        break;
      }
      if (track.artistId.getValue() === artistId && pool.offer(track)) {
        offered += 1;
      }
    }
  }

  private async seedArtistCandidates(
    genre: CatalogGenre,
    limit: number,
    regionalArtists: SimilarArtistCandidate[] | null,
  ): Promise<SimilarArtistCandidate[]> {
    const candidateLimit = Math.min(
      MAX_SEED_ARTIST_CANDIDATE_LIMIT,
      Math.max(
        limit + SEED_ARTIST_CANDIDATE_BUFFER,
        MIN_SEED_ARTIST_CANDIDATE_LIMIT,
      ),
    );

    try {
      return regionalArtists
        ? regionalArtists.slice(0, candidateLimit)
        : await this.discoveryCatalog.getTopArtistsForTag(
            genre.id,
            candidateLimit,
          );
    } catch (error) {
      if (isFatalCatalogError(error)) {
        throw error;
      }
      this.logger.warn(
        `Genre seed artist resolve failed: ${errorMessage(error)}`,
      );
      return [];
    }
  }

  private async resolveOneSeedArtist(
    provider: CatalogProviderPort,
    candidateName: string,
    seen: Set<string>,
    resolvedCount: number,
  ): Promise<SeedFanoutOutcome<Artist>> {
    try {
      const artists = await provider.searchArtists(
        candidateName,
        ARTIST_NAME_MATCH_CANDIDATE_LIMIT,
      );
      const match = pickUniqueArtistMatch(
        candidateName,
        artists.filter((artist) => !this.isJunkArtist(artist)),
      );
      if (!match) {
        return null;
      }
      const id = match.id.getValue();
      if (seen.has(id)) {
        return null;
      }
      seen.add(id);
      return match;
    } catch (error) {
      if (error instanceof CatalogUnavailableError) {
        throw error;
      }
      if (isSpotifyQuotaError(error)) {
        if (resolvedCount === 0) {
          throw error;
        }
        return 'stop';
      }
      this.logger.warn(
        `Seed artist resolve failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private isJunkArtist(artist: Artist): boolean {
    const name = artist.name.trim().toLowerCase();
    return (
      !name ||
      name === 'various artists' ||
      name === 'various' ||
      name === 'unknown' ||
      name === 'unknown artist'
    );
  }

  private isJunkTrack(track: Track): boolean {
    const artistName = track.artistName.trim().toLowerCase();
    return (
      artistName === 'various artists' ||
      artistName === 'various' ||
      track.artistId.getValue() === SPOTIFY_VARIOUS_ARTISTS_ARTIST_ID
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
