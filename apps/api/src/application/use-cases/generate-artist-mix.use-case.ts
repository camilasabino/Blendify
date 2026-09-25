import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type PlaylistGeneration,
  type PlaylistSeedDto,
  type PopularityMode as PopularityModeValue,
} from '@blendify/contracts';
import {
  CATALOG_PROVIDER_FACTORY,
  type CatalogProviderFactoryPort,
  type CatalogProviderPort,
} from '../../domain/repositories/catalog-provider.port';
import {
  PROVIDER_QUOTA,
  type ProviderQuotaPort,
} from '../../domain/repositories/provider-quota.port';
import {
  DISCOVERY_CATALOG,
  type DiscoveryCatalogPort,
} from '../../domain/repositories/discovery-catalog.port';
import { PlaylistGenerationService } from '../../domain/services/playlist-generation.service';
import {
  GeneratedPlaylist,
  pickLinkedCoverArtwork,
  trackCoverSource,
} from '../../domain/playlist/generated-playlist';
import { Artist } from '../../domain/artist/artist.entity';
import { pickBestArtistMatch } from '../../domain/artist/artist-name-match';
import { ArtistId } from '../../domain/value-objects/artist-id.vo';
import { Track } from '../../domain/track/track.entity';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import { CatalogUnavailableError } from '../../domain/errors/catalog-unavailable.error';
import { MAX_TRACKS, maxTracksPerSeedForCount } from '../../domain/constants';
import {
  isFatalCatalogError,
  isSpotifyQuotaError,
  resolveCatalogWithPoolExpand,
} from '../../domain/genre/catalog-resolve';
import {
  buildDefaultPlaylistDescription,
  buildDefaultPlaylistName,
} from '../../domain/playlist/default-playlist-name';
import {
  GenerateArtistMixDto,
  GenerateArtistMixSchema,
} from '../dto/generate-artist-mix.dto';
import {
  GenerationProgressTracker,
  type ProgressReporter,
} from '../services/generation-progress.tracker';

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
    options?: { onProgress?: ProgressReporter },
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
      catalog,
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
        catalog,
        artist,
        fetchBudget,
        mode,
        (seedMatched) => {
          matched = Math.min(totalNeeded, baseMatched + seedMatched);
          tracker?.report('matching_tracks', matched, Math.max(1, totalNeeded));
        },
      );

      matched = Math.min(
        totalNeeded,
        baseMatched + Math.min(collected.length, tracksPerSeed),
      );
      tracker?.report('matching_tracks', matched, Math.max(1, totalNeeded));
      map.set(artistId, collected);
    }

    return map;
  }

  /**
   * Chart pool (popular 0–40% / balanced full / rarities 60–100%), shuffled.
   * If the preferred band underfills, expand toward the rest of the chart.
   * Remaining shortfall → artist search.
   */
  private async fetchTracksForArtist(
    catalog: CatalogProviderPort,
    artist: Artist,
    tracksPerSeed: number,
    mode: PopularityModeValue,
    onMatched?: (matched: number) => void,
  ): Promise<Track[]> {
    const collected = await this.fetchTracksForArtistFromLastFm(
      catalog,
      artist,
      tracksPerSeed,
      mode,
      onMatched,
    );

    if (collected.length < tracksPerSeed) {
      this.quota.assertAvailable();
      await this.appendArtistSearchFallback(
        catalog,
        artist,
        collected,
        tracksPerSeed,
        onMatched,
      );
    }

    return collected;
  }

  private async appendArtistSearchFallback(
    catalog: CatalogProviderPort,
    artist: Artist,
    collected: Track[],
    tracksPerSeed: number,
    onMatched?: (matched: number) => void,
  ): Promise<void> {
    try {
      const page = await catalog.searchTracks(`artist:"${artist.name}"`, {
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
      if (error instanceof CatalogUnavailableError) throw error;
      if (isSpotifyQuotaError(error)) {
        if (collected.length === 0) throw error;
        return;
      }
      this.logger.warn(
        `Artist track search fallback failed for ${artist.name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async fetchTracksForArtistFromLastFm(
    catalog: CatalogProviderPort,
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
        catalog,
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
      if (isFatalCatalogError(error)) throw error;
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
