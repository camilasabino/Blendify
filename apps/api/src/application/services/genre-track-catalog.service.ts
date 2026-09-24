import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PopularityMode } from '@blendify/contracts';
import { pickStrictArtistMatch } from '../../domain/artist/artist-name-match';
import { Artist } from '../../domain/artist/artist.entity';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import { CatalogUnavailableError } from '../../domain/errors/catalog-unavailable.error';
import {
  preferPopularTracks,
  preferRareTracks,
  rankTracksForMix,
} from '../../domain/genre/artist-mix-queries';
import {
  isFatalCatalogError,
  isSpotifyQuotaError,
  resolveAttemptBudget,
  resolveCatalogWithPoolExpand,
} from '../../domain/genre/catalog-resolve';
import {
  type CuratedGenre,
  genreTrackGroupKey,
} from '../../domain/genre/curated-genres';
import {
  buildGenreQueries,
  tracksPerSeedArtist,
  type GenreTrackQuery,
} from '../../domain/genre/genre-playlist-generation.service';
import {
  DISCOVERY_CATALOG,
  type DiscoveryCatalogPort,
} from '../../domain/repositories/discovery-catalog.port';
import type { CatalogProviderPort } from '../../domain/repositories/catalog-provider.port';
import {
  PROVIDER_QUOTA,
  type ProviderQuotaPort,
} from '../../domain/repositories/provider-quota.port';
import { Track } from '../../domain/track/track.entity';

export interface GenreTrackCatalogResult {
  tracksByGenre: Map<string, Track[]>;
  coverCandidates: Map<string, string | undefined>;
}

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
    genres: CuratedGenre[],
    popularity: PopularityMode,
    tracksPerSeed: number,
    options?: { onMatched?: (matched: number) => void },
  ): Promise<GenreTrackCatalogResult> {
    this.quota.assertAvailable();
    if (!this.discoveryCatalog.isConfigured()) {
      throw BusinessRuleError.genreLookupUnavailable({
        reason: 'not_configured',
      });
    }

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
    genre: CuratedGenre,
    popularity: PopularityMode,
    tracksPerSeed: number,
    onMatched?: (matched: number) => void,
  ): Promise<{
    genreKey: string;
    tracks: Track[];
    coverUrl: string | undefined;
  }> {
    const plan = buildGenreQueries(genre, popularity);
    const genreKey = genreTrackGroupKey(genre.id);
    let collected = await this.resolveTagTracks(
      provider,
      genre,
      popularity,
      tracksPerSeed,
      onMatched,
    );

    let coverUrl: string | undefined;
    if (collected.length < Math.ceil(tracksPerSeed * 0.5)) {
      this.quota.assertAvailable();
      const fallback = await this.resolveSeedArtistTracks(
        provider,
        genre,
        plan,
        tracksPerSeed,
      );
      coverUrl = fallback.coverUrl;
      if (fallback.tracks.length > collected.length) {
        collected = fallback.tracks;
        onMatched?.(Math.min(collected.length, tracksPerSeed));
      }
    }

    let ranked = rankTracksForMix(collected, plan.rank);
    if (plan.minPopularity != null && plan.minPopularity > 0) {
      ranked = preferPopularTracks(ranked, tracksPerSeed, plan.minPopularity);
    }
    if (plan.maxPopularity != null) {
      ranked = preferRareTracks(ranked, tracksPerSeed, plan.maxPopularity);
    }

    if (!coverUrl) {
      coverUrl = ranked.find((track) => track.albumImageUrl)?.albumImageUrl;
    }

    return { genreKey, tracks: ranked, coverUrl };
  }

  private async resolveTagTracks(
    provider: CatalogProviderPort,
    genre: CuratedGenre,
    popularity: PopularityMode,
    tracksPerSeed: number,
    onMatched?: (matched: number) => void,
  ): Promise<Track[]> {
    const tag = genre.spotifyGenre.trim().toLowerCase();
    if (!tag) return [];

    try {
      const chart = await this.discoveryCatalog.getTopTracksForTag(tag, 100);
      if (chart.length === 0) return [];

      const resolved = await resolveCatalogWithPoolExpand(
        provider,
        chart,
        popularity,
        tracksPerSeed,
        {
          concurrency: 1,
          maxPerArtist: 3,
          onProgress: (update) => {
            onMatched?.(Math.min(update.matched, tracksPerSeed));
          },
        },
      );
      return resolved.filter((track) => !this.isJunkTrack(track));
    } catch (error) {
      if (isFatalCatalogError(error)) throw error;
      return [];
    }
  }

  private async resolveSeedArtistTracks(
    provider: CatalogProviderPort,
    genre: CuratedGenre,
    plan: GenreTrackQuery,
    tracksPerSeed: number,
  ): Promise<{ tracks: Track[]; coverUrl: string | undefined }> {
    // Each fallback seed costs a Spotify search, so cap fan-out tightly.
    const seedLimit = Math.min(8, Math.max(5, Math.ceil(tracksPerSeed * 0.35)));
    const seedArtists = await this.resolveSeedArtists(
      provider,
      genre,
      seedLimit,
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
      if (collected.length >= fetchTarget) break;
      this.quota.assertAvailable();

      const page = await this.searchTracksForSeedArtist(
        provider,
        artist,
        collected.length,
      );
      if (page === 'stop') break;
      if (page === null) continue;

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
      tracks: rankTracksForMix(collected, plan.rank),
      coverUrl: seedArtists[0]?.imageUrl,
    };
  }

  /** Returns tracks, `null` to skip artist, or `'stop'` to end the seed loop. */
  private async searchTracksForSeedArtist(
    provider: CatalogProviderPort,
    artist: Artist,
    collectedCount: number,
  ): Promise<Track[] | null | 'stop'> {
    try {
      return await provider.searchTracks(`artist:"${artist.name}"`, {
        limit: 10,
        offset: 0,
      });
    } catch (error) {
      if (error instanceof CatalogUnavailableError) throw error;
      if (isSpotifyQuotaError(error)) {
        if (collectedCount === 0) throw error;
        return 'stop';
      }
      this.logger.warn(
        `Genre artist search failed for ${artist.name}: ${
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
      if (track.artistId.getValue() !== artistId) continue;
      if (this.isJunkTrack(track)) continue;
      const id = track.id.getValue();
      if (seen.has(id)) continue;
      const used = perArtistSeen.get(artistId) ?? 0;
      if (used >= tracksPerArtist) break;
      seen.add(id);
      perArtistSeen.set(artistId, used + 1);
      collected.push(track);
      if (collected.length >= fetchTarget) break;
    }
  }

  private async resolveSeedArtists(
    provider: CatalogProviderPort,
    genre: CuratedGenre,
    limit: number,
  ): Promise<Artist[]> {
    const tag = genre.spotifyGenre.trim().toLowerCase();
    if (!tag) return [];

    try {
      const candidates = await this.discoveryCatalog.getTopArtistsForTag(
        tag,
        Math.min(16, Math.max(limit + 4, 10)),
      );
      if (candidates.length === 0) return [];

      const resolved: Artist[] = [];
      const seen = new Set<string>();

      for (const candidate of candidates) {
        if (resolved.length >= limit) break;
        this.quota.assertAvailable();

        const outcome = await this.resolveOneSeedArtist(
          provider,
          candidate.name,
          seen,
          resolved.length,
        );
        if (outcome === 'stop') break;
        if (outcome) resolved.push(outcome);
      }

      return resolved;
    } catch (error) {
      if (isFatalCatalogError(error)) throw error;
      return [];
    }
  }

  /** Returns a match, `null` to skip, or `'stop'` on quota with partial results. */
  private async resolveOneSeedArtist(
    provider: CatalogProviderPort,
    candidateName: string,
    seen: Set<string>,
    resolvedCount: number,
  ): Promise<Artist | null | 'stop'> {
    try {
      const artists = await provider.searchArtists(candidateName, 3);
      const match = pickStrictArtistMatch(
        candidateName,
        artists.filter((artist) => !this.isJunkArtist(artist)),
      );
      if (!match) return null;
      const id = match.id.getValue();
      if (seen.has(id)) return null;
      seen.add(id);
      return match;
    } catch (error) {
      if (error instanceof CatalogUnavailableError) throw error;
      if (isSpotifyQuotaError(error)) {
        if (resolvedCount === 0) throw error;
        return 'stop';
      }
      this.logger.warn(
        `Seed artist resolve failed for ${candidateName}: ${
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
      track.artistId.getValue() === '0LyfQWJT6nXafLPZqxe9Of'
    );
  }
}
