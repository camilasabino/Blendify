import { Inject, Injectable, Logger } from '@nestjs/common';
import type { GenreRegion, PopularityMode } from '@blendify/contracts';
import { pickStrictArtistMatch } from '@/domain/artist/artist-name-match';
import { Artist } from '@/domain/artist/artist.entity';
import { BusinessRuleError } from '@/domain/errors/business-rule.error';
import { CatalogUnavailableError } from '@/domain/errors/catalog-unavailable.error';
import {
  isFatalCatalogError,
  isSpotifyQuotaError,
  resolveAttemptBudget,
  resolveCatalogTracks,
  resolveCatalogWithPoolExpand,
  seedResolveAttemptLimit,
} from '@/domain/genre/catalog-resolve';
import { interleaveArtistCatalogWindows } from '@/domain/genre/catalog-window';
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
const MIN_TAG_COVERAGE_RATIO = 0.5;
const SEED_ARTIST_FALLBACK_RATIO = 0.35;
const MIN_SEED_ARTIST_FALLBACK_LIMIT = 5;
const MAX_SEED_ARTIST_FALLBACK_LIMIT = 8;
const SEED_ARTIST_CANDIDATE_BUFFER = 4;
const MIN_SEED_ARTIST_CANDIDATE_LIMIT = 10;
const MAX_SEED_ARTIST_CANDIDATE_LIMIT = 16;
const ARTIST_NAME_MATCH_CANDIDATE_LIMIT = 3;
const ARTIST_CHART_TRACK_LIMIT = 50;
const ARTIST_CHART_LOOKUP_CONCURRENCY = 4;

export interface GenreTrackCatalogResult {
  tracksByGenre: Map<string, Track[]>;
  coverCandidates: Map<string, string | undefined>;
}

/** `null` skips this candidate and continues; `'stop'` ends the seed-fanout loop early (quota hit). */
type SeedFanoutOutcome<T> = T | null | 'stop';

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
      region?: GenreRegion;
      onMatched?: (matched: number) => void;
    },
  ): Promise<GenreTrackCatalogResult> {
    this.quota.assertAvailable();
    if (!this.discoveryCatalog.isConfigured()) {
      throw BusinessRuleError.genreLookupUnavailable({
        reason: 'not_configured',
      });
    }

    const regionalPool = options?.region
      ? new RegionalGenreArtistPool(
          this.discoveryCatalog,
          options.region,
          this.logger,
        )
      : null;

    const tracksByGenre = new Map<string, Track[]>();
    const coverCandidates = new Map<string, string | undefined>();
    let matched = 0;
    const totalNeeded = genres.length * tracksPerSeed;

    // Serial genre fetches keep Spotify Dev Mode quota usage predictable.
    for (const genre of genres) {
      this.quota.assertAvailable();
      const baseMatched = matched;
      const result = await this.resolveGenre(
        provider,
        genre,
        popularity,
        tracksPerSeed,
        regionalPool,
        (seedMatched) => {
          matched = Math.min(totalNeeded, baseMatched + seedMatched);
          options?.onMatched?.(matched);
        },
      );
      matched = Math.min(
        totalNeeded,
        baseMatched + Math.min(result.tracks.length, tracksPerSeed),
      );
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
    tracksPerSeed: number,
    regionalPool: RegionalGenreArtistPool | null,
    onMatched?: (matched: number) => void,
  ): Promise<{
    genreKey: string;
    tracks: Track[];
    coverUrl: string | undefined;
  }> {
    const genreKey = genreTrackGroupKey(genre.id);
    const regionalArtists = regionalPool
      ? await regionalPool.qualifiedArtists(
          genre.id,
          tracksPerSeed + SEED_ARTIST_CANDIDATE_BUFFER,
        )
      : null;
    let collected = regionalArtists
      ? await this.resolveRegionalArtistTracks(
          provider,
          regionalArtists,
          popularity,
          tracksPerSeed,
          onMatched,
        )
      : await this.resolveTagTracks(
          provider,
          genre,
          popularity,
          tracksPerSeed,
          onMatched,
        );

    let coverUrl: string | undefined;
    if (collected.length < Math.ceil(tracksPerSeed * MIN_TAG_COVERAGE_RATIO)) {
      this.quota.assertAvailable();
      const fallback = await this.resolveSeedArtistTracks(
        provider,
        genre,
        tracksPerSeed,
        regionalArtists,
      );
      coverUrl = fallback.coverUrl;
      if (fallback.tracks.length > collected.length) {
        collected = fallback.tracks;
        onMatched?.(Math.min(collected.length, tracksPerSeed));
      }
    }

    if (!coverUrl) {
      coverUrl = collected.find((track) => track.albumImageUrl)?.albumImageUrl;
    }

    return { genreKey, tracks: collected, coverUrl };
  }

  private async resolveTagTracks(
    provider: CatalogProviderPort,
    genre: CatalogGenre,
    popularity: PopularityMode,
    tracksPerSeed: number,
    onMatched?: (matched: number) => void,
  ): Promise<Track[]> {
    try {
      const chart = await this.discoveryCatalog.getTopTracksForTag(
        genre.id,
        GENRE_TAG_TRACK_CANDIDATE_LIMIT,
      );
      if (chart.length === 0) {
        return [];
      }

      const resolved = await resolveCatalogWithPoolExpand(
        provider,
        chart,
        popularity,
        tracksPerSeed,
        {
          maxPerArtist: GENRE_MIX_MAX_TRACKS_PER_ARTIST,
          onProgress: (update) => {
            onMatched?.(Math.min(update.matched, tracksPerSeed));
          },
        },
      );
      return resolved.filter((track) => !this.isJunkTrack(track));
    } catch (error) {
      if (isFatalCatalogError(error)) {
        throw error;
      }
      this.logger.warn(`Tag chart resolve failed: ${errorMessage(error)}`);
      return [];
    }
  }

  private async resolveRegionalArtistTracks(
    provider: CatalogProviderPort,
    artists: SimilarArtistCandidate[],
    popularity: PopularityMode,
    tracksPerSeed: number,
    onMatched?: (matched: number) => void,
  ): Promise<Track[]> {
    if (artists.length === 0) {
      return [];
    }

    const charts = await this.loadArtistCharts(artists);
    const refs = interleaveArtistCatalogWindows(
      charts,
      popularity,
      GENRE_MIX_MAX_TRACKS_PER_ARTIST,
    ).slice(0, seedResolveAttemptLimit(tracksPerSeed));

    try {
      const resolved = await resolveCatalogTracks(provider, refs, {
        needed: tracksPerSeed,
        maxPerArtist: GENRE_MIX_MAX_TRACKS_PER_ARTIST,
        onProgress: (update) => {
          onMatched?.(Math.min(update.matched, tracksPerSeed));
        },
      });
      return resolved.filter((track) => !this.isJunkTrack(track));
    } catch (error) {
      if (isFatalCatalogError(error)) {
        throw error;
      }
      this.logger.warn(`Regional chart resolve failed: ${errorMessage(error)}`);
      return [];
    }
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
          batch.map((artist) => this.loadArtistChart(artist.name)),
        )),
      );
    }
    return charts;
  }

  private async loadArtistChart(
    artistName: string,
  ): Promise<CatalogTrackCandidate[]> {
    try {
      return await this.discoveryCatalog.getTopTracksForArtist(
        artistName,
        ARTIST_CHART_TRACK_LIMIT,
      );
    } catch (error) {
      this.logger.warn(`Artist chart lookup failed: ${errorMessage(error)}`);
      return [];
    }
  }

  private async resolveSeedArtistTracks(
    provider: CatalogProviderPort,
    genre: CatalogGenre,
    tracksPerSeed: number,
    regionalArtists: SimilarArtistCandidate[] | null,
  ): Promise<{ tracks: Track[]; coverUrl: string | undefined }> {
    // Each fallback seed costs a Spotify search, so cap fan-out tightly.
    const seedLimit = Math.min(
      MAX_SEED_ARTIST_FALLBACK_LIMIT,
      Math.max(
        MIN_SEED_ARTIST_FALLBACK_LIMIT,
        Math.ceil(tracksPerSeed * SEED_ARTIST_FALLBACK_RATIO),
      ),
    );
    const seedArtists = await this.resolveSeedArtists(
      provider,
      genre,
      seedLimit,
      regionalArtists,
    );
    if (seedArtists.length === 0) {
      return { tracks: [], coverUrl: undefined };
    }

    const collected: Track[] = [];
    const seen = new Set<string>();
    const perArtistSeen = new Map<string, number>();
    const tracksPerArtist = tracksPerSeedArtist(
      tracksPerSeed,
      seedArtists.length,
    );
    const fetchTarget = Math.min(
      resolveAttemptBudget(tracksPerSeed),
      seedArtists.length * tracksPerArtist,
    );

    for (const artist of seedArtists) {
      if (collected.length >= fetchTarget) {
        break;
      }
      this.quota.assertAvailable();

      const page = await this.searchTracksForSeedArtist(
        provider,
        artist,
        collected.length,
      );
      if (page === 'stop') {
        break;
      }
      if (page === null) {
        continue;
      }

      this.collectMatchingSeedTracks({
        page,
        artistId: artist.id.getValue(),
        tracksPerArtist,
        fetchTarget,
        collected,
        seen,
        perArtistSeen,
      });
    }

    return {
      tracks: collected,
      coverUrl: seedArtists[0]?.imageUrl,
    };
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

  private collectMatchingSeedTracks(input: {
    page: Track[];
    artistId: string;
    tracksPerArtist: number;
    fetchTarget: number;
    collected: Track[];
    seen: Set<string>;
    perArtistSeen: Map<string, number>;
  }): void {
    const {
      page,
      artistId,
      tracksPerArtist,
      fetchTarget,
      collected,
      seen,
      perArtistSeen,
    } = input;

    for (const track of page) {
      if (track.artistId.getValue() !== artistId) {
        continue;
      }
      if (this.isJunkTrack(track)) {
        continue;
      }
      const id = track.id.getValue();
      if (seen.has(id)) {
        continue;
      }
      const used = perArtistSeen.get(artistId) ?? 0;
      if (used >= tracksPerArtist) {
        break;
      }
      seen.add(id);
      perArtistSeen.set(artistId, used + 1);
      collected.push(track);
      if (collected.length >= fetchTarget) {
        break;
      }
    }
  }

  private async resolveSeedArtists(
    provider: CatalogProviderPort,
    genre: CatalogGenre,
    limit: number,
    regionalArtists: SimilarArtistCandidate[] | null,
  ): Promise<Artist[]> {
    const candidateLimit = Math.min(
      MAX_SEED_ARTIST_CANDIDATE_LIMIT,
      Math.max(
        limit + SEED_ARTIST_CANDIDATE_BUFFER,
        MIN_SEED_ARTIST_CANDIDATE_LIMIT,
      ),
    );

    try {
      const candidates = regionalArtists
        ? regionalArtists.slice(0, candidateLimit)
        : await this.discoveryCatalog.getTopArtistsForTag(
            genre.id,
            candidateLimit,
          );
      if (candidates.length === 0) {
        return [];
      }

      const resolved: Artist[] = [];
      const seen = new Set<string>();

      for (const candidate of candidates) {
        if (resolved.length >= limit) {
          break;
        }
        this.quota.assertAvailable();

        const outcome = await this.resolveOneSeedArtist(
          provider,
          candidate.name,
          seen,
          resolved.length,
        );
        if (outcome === 'stop') {
          break;
        }
        if (outcome) {
          resolved.push(outcome);
        }
      }

      return resolved;
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
      const match = pickStrictArtistMatch(
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
