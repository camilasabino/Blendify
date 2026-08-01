import { Inject, Injectable } from '@nestjs/common';
import type { PopularityMode } from '@blendify/contracts';
import { pickStrictArtistMatch } from '../../domain/artist/artist-name-match';
import { Artist } from '../../domain/artist/artist.entity';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import {
  preferPopularTracks,
  preferRareTracks,
  rankTracksForMix,
} from '../../domain/genre/artist-mix-queries';
import {
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
import type { MusicProviderPort } from '../../domain/repositories/music-provider.port';
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
  constructor(
    @Inject(DISCOVERY_CATALOG)
    private readonly discoveryCatalog: DiscoveryCatalogPort,
    @Inject(PROVIDER_QUOTA) private readonly quota: ProviderQuotaPort,
  ) {}

  async resolve(
    provider: MusicProviderPort,
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
    provider: MusicProviderPort,
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
    provider: MusicProviderPort,
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
      if (isSpotifyQuotaError(error)) throw error;
      return [];
    }
  }

  private async resolveSeedArtistTracks(
    provider: MusicProviderPort,
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

      let page: Track[];
      try {
        page = await provider.searchTracks(`artist:"${artist.name}"`, {
          limit: 10,
          offset: 0,
        });
      } catch (error) {
        if (isSpotifyQuotaError(error)) {
          if (collected.length === 0) throw error;
          break;
        }
        continue;
      }

      const artistId = artist.id.getValue();
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

    return {
      tracks: rankTracksForMix(collected, plan.rank),
      coverUrl: seedArtists[0]?.imageUrl,
    };
  }

  private async resolveSeedArtists(
    provider: MusicProviderPort,
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

        try {
          const artists = await provider.searchArtists(candidate.name, 3);
          const match = pickStrictArtistMatch(
            candidate.name,
            artists.filter((artist) => !this.isJunkArtist(artist)),
          );
          if (!match) continue;
          const id = match.id.getValue();
          if (seen.has(id)) continue;
          seen.add(id);
          resolved.push(match);
        } catch (error) {
          if (isSpotifyQuotaError(error)) {
            if (resolved.length === 0) throw error;
            break;
          }
        }
      }

      return resolved;
    } catch (error) {
      if (isSpotifyQuotaError(error)) throw error;
      return [];
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
