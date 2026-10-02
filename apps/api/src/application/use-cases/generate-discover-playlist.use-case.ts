import { Inject, Injectable, Logger } from '@nestjs/common';
import { supportedSelectionFilters } from '@blendify/contracts';
import type { z } from 'zod';
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
  type DiscoveryArtistIdentity,
  type DiscoveryCatalogPort,
  type SimilarArtistCandidate,
} from '@/domain/repositories/discovery-catalog.port';
import {
  normalizeArtistName,
  pickStrictArtistMatch,
  pickUniqueArtistMatch,
} from '@/domain/artist/artist-name-match';
import { ArtistId } from '@/domain/value-objects/artist-id.vo';
import { readTrackPopularity } from '@/domain/track/track-popularity';
import { Track } from '@/domain/track/track.entity';
import type { TrackAcceptance } from '@/domain/services/accepted-track-pool';
import { TrackId } from '@/domain/value-objects/track-id.vo';
import {
  GeneratedPlaylist,
  pickLinkedCoverArtwork,
  trackCoverSource,
} from '@/domain/playlist/generated-playlist';
import { BusinessRuleError } from '@/domain/errors/business-rule.error';
import { maxTracksPerSeedForCount } from '@/domain/constants';
import {
  DISCOVER_FALLBACK_SIMILAR_ARTISTS_LIMIT,
  DISCOVER_FALLBACK_TOP_TRACKS_PER_ARTIST,
  DISCOVER_FALLBACK_TOP_TRACKS_MAX,
  DISCOVER_FALLBACK_TOP_TRACKS_MIN,
  DISCOVER_MIN_SIMILAR,
  DISCOVER_MIN_SIMILAR_TRACKS,
  minimumResolvedDiscoverTracks,
  DISCOVER_SIMILAR_FETCH,
  DISCOVER_SIMILAR_TRACK_FETCH,
  buildDiscoverPlaylistDescription,
  buildDiscoverPlaylistName,
  discoverSimilarTargetForTracks,
  tracksPerSeedForDiscoverTarget,
} from '@/domain/playlist/discover-playlist-name';
import { primaryArtistName } from '@/domain/discovery/similar-track-query';
import { orderSimilarTrackCandidates } from '@/domain/discovery/similar-track-familiarity';
import { seedResolveAttemptLimit } from '@/domain/genre/catalog-resolve';
import { orderBySimilarityRankingBands } from '@/domain/discovery/similar-artist-ranking-bands';
import {
  isSeedArtistCandidate,
  isSeedArtistTrack,
  seedArtistTrackAllowance,
} from '@/domain/discovery/seed-artist-share';
import { createOrderingStrategy } from '@/domain/services/strategies/track-ordering.strategy';
import {
  GenerateDiscoverPlaylistDto,
  GenerateDiscoverPlaylistSchema,
} from '@/application/dto/generate-discover-playlist.dto';
import { ARTIST_MIX_WORK_POLICY } from './artist-mix-work-policy';
import { GenerateArtistMixUseCase } from './generate-artist-mix.use-case';
import {
  GenerationProgressTracker,
  monotonicProgressReporter,
  type ProgressReporter,
} from '@/application/services/generation-progress.tracker';
import {
  ARTIST_FILTER_QUALIFICATION_CONCURRENCY,
  ArtistFilterQualifier,
} from '@/application/services/artist-filter-qualifier';
import {
  artistSelectionFilters,
  hasArtistSelectionFilters,
} from '@/domain/selection-filters/artist-selection-filters';
import {
  trackSelectionFilters,
  withTrackSelectionFilters,
} from '@/domain/selection-filters/track-selection-filters';

const SEED_ARTIST_MATCH_CANDIDATES = 10;

type DiscoverInput = z.output<typeof GenerateDiscoverPlaylistSchema>;
type ArtistDiscoverInput = Extract<DiscoverInput, { kind: 'discover_artist' }>;
type TrackDiscoverInput = Extract<DiscoverInput, { kind: 'discover_track' }>;
type SimilarTrackRef = {
  name: string;
  artistName: string;
  playcount?: number;
  artist?: DiscoveryArtistIdentity;
};

@Injectable()
export class GenerateDiscoverPlaylistUseCase {
  private readonly logger = new Logger(GenerateDiscoverPlaylistUseCase.name);

  constructor(
    private readonly artistMix: GenerateArtistMixUseCase,
    @Inject(DISCOVERY_CATALOG)
    private readonly discoveryCatalog: DiscoveryCatalogPort,
    @Inject(CATALOG_PROVIDER_FACTORY)
    private readonly catalogs: CatalogProviderFactoryPort,
    @Inject(PROVIDER_QUOTA) private readonly quota: ProviderQuotaPort,
  ) {}

  async execute(
    raw: GenerateDiscoverPlaylistDto,
    options?: { onProgress?: ProgressReporter; acceptTrack?: TrackAcceptance },
  ): Promise<GeneratedPlaylist> {
    const input = GenerateDiscoverPlaylistSchema.parse(raw);
    const onProgress = monotonicProgressReporter(options?.onProgress);

    if (!this.discoveryCatalog.isConfigured()) {
      throw new BusinessRuleError(
        'Last.fm API key is not configured.',
        'LASTFM_NOT_CONFIGURED',
      );
    }

    if (input.kind === 'discover_track') {
      return this.executeFromTrack(
        input,
        onProgress,
        withTrackSelectionFilters(
          trackSelectionFilters(input.filters),
          options?.acceptTrack,
        ),
      );
    }
    return this.executeFromArtist(input, onProgress, options?.acceptTrack);
  }

  private async executeFromArtist(
    input: ArtistDiscoverInput,
    onProgress?: ProgressReporter,
    acceptTrack?: TrackAcceptance,
  ): Promise<GeneratedPlaylist> {
    const tracker = new GenerationProgressTracker(onProgress);
    const catalog = this.catalogs.forMarket(input.market);
    tracker.report('resolving_seeds', 0, 1);
    const seed = await this.resolveSeedArtist(catalog, input);
    tracker.report('resolving_seeds', 1, 1);

    let similarArtists: SimilarArtistCandidate[];
    try {
      const similar = await this.discoveryCatalog.getSimilarArtists(
        seed.name,
        DISCOVER_SIMILAR_FETCH,
      );
      const seedKey = normalizeArtistName(seed.name);
      similarArtists = orderBySimilarityRankingBands(similar)
        .map((a) => ({ ...a, name: a.name.trim() }))
        .filter((a) => a.name && normalizeArtistName(a.name) !== seedKey);
    } catch (error) {
      this.logger.warn(
        `Last.fm similar failed for discover: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BusinessRuleError(
        'Could not load similar artists from Last.fm.',
        'LASTFM_SIMILAR_FAILED',
      );
    }

    if (similarArtists.length < DISCOVER_MIN_SIMILAR) {
      throw new BusinessRuleError(
        'Not enough similar artists to build a Discover mix. Try another seed.',
        'DISCOVER_NOT_ENOUGH_SIMILAR',
        { seed: seed.name, found: similarArtists.length },
      );
    }

    const similarTarget = discoverSimilarTargetForTracks(
      input.targetTrackCount,
    );
    const artistQualifier = this.artistQualifier(input);
    const resolvedSimilar = await this.resolveSimilarArtists(
      catalog,
      similarArtists,
      seed.id.getValue(),
      similarTarget,
      tracker,
      artistQualifier,
    );
    artistQualifier?.assertEnforceable();

    if (resolvedSimilar.length < DISCOVER_MIN_SIMILAR) {
      throw new BusinessRuleError(
        'Could not match enough similar artists on Spotify. Try another seed.',
        'DISCOVER_RESOLVE_FAILED',
        { seed: seed.name, resolved: resolvedSimilar.length },
      );
    }

    const artists = resolvedSimilar;

    const maxPerArtist = maxTracksPerSeedForCount(artists.length);
    const tracksPerSeed = tracksPerSeedForDiscoverTarget(
      input.targetTrackCount,
      artists.length,
      maxPerArtist,
    );

    const name = buildDiscoverPlaylistName(seed.name);
    const description =
      input.description?.trim() ||
      buildDiscoverPlaylistDescription({
        seedName: seed.name,
        seedType: 'artist',
      });

    this.logger.debug(
      `Discover artist mix: target ${input.targetTrackCount}, ${artists.length} artist(s), ${tracksPerSeed} track(s)/artist`,
    );

    return this.artistMix.execute(
      {
        market: input.market,
        kind: 'artist_mix',
        name,
        description,
        artistIds: artists.map((a) => a.id),
        artists,
        filters: supportedSelectionFilters('artist_mix', input.filters),
        tracksPerSeed,
        popularity: input.popularity,
        orderMode: input.orderMode,
        maxTracks: input.targetTrackCount,
        displaySeeds: [
          {
            type: 'artist',
            id: seed.id.getValue(),
            name: seed.name,
            imageUrl: seed.imageUrl ?? null,
          },
        ],
        generation: {
          version: 1,
          kind: 'discover_artist',
          targetTrackCount: input.targetTrackCount,
          seed: {
            id: seed.id.getValue(),
            name: seed.name,
            imageUrl: seed.imageUrl ?? null,
          },
          filters: input.filters,
          popularity: input.popularity,
          orderMode: input.orderMode,
        },
      },
      {
        onProgress,
        acceptTrack,
        workPolicy: ARTIST_MIX_WORK_POLICY.COVERAGE_FIRST_BOUNDED,
      },
    );
  }

  private async executeFromTrack(
    input: TrackDiscoverInput,
    onProgress?: ProgressReporter,
    acceptTrack?: TrackAcceptance,
  ): Promise<GeneratedPlaylist> {
    const tracker = new GenerationProgressTracker(onProgress);

    this.quota.assertAvailable();

    const catalog = this.catalogs.forMarket(input.market);
    tracker.report('resolving_seeds', 0, 1);
    const seedTrack = await this.resolveSeedTrack(catalog, input);
    tracker.report('resolving_seeds', 1, 1);

    let similarRaw: SimilarTrackCandidateList;
    try {
      similarRaw = await this.collectSimilarTrackCandidates(
        seedTrack,
        DISCOVER_SIMILAR_TRACK_FETCH,
      );
    } catch (error) {
      this.logger.warn(
        `Last.fm similar tracks failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BusinessRuleError(
        'Could not load similar tracks from Last.fm.',
        'LASTFM_SIMILAR_FAILED',
      );
    }

    const artistQualifier = this.artistQualifier(input);
    const selected = await this.selectDiverseTracks(
      catalog,
      seedTrack,
      similarRaw,
      input,
      { tracker, acceptTrack, artistQualifier },
    );

    const tracksByArtist = groupTracksByArtist(selected);
    const ordered = createOrderingStrategy(input.orderMode).order(
      tracksByArtist,
    );
    const tracks = ordered.slice(0, input.targetTrackCount);

    if (tracks.length === 0) {
      throw BusinessRuleError.noTracksFound({
        names: [seedTrack.name],
        popularity: input.popularity,
        source: 'artists',
      });
    }

    const playlistName = buildDiscoverPlaylistName(seedTrack.name);
    const description =
      input.description?.trim() ||
      buildDiscoverPlaylistDescription({
        seedName: seedTrack.name,
        seedType: 'track',
        artistName: seedTrack.artistName,
      });

    this.logger.debug(
      `Discover track mix: ${tracks.length}/${input.targetTrackCount}`,
    );

    return GeneratedPlaylist.create({
      name: playlistName,
      description,
      seeds: [
        {
          type: 'track',
          id: seedTrack.id.getValue(),
          name: seedTrack.name,
          artistId: seedTrack.artistId.getValue(),
          artistName: seedTrack.artistName,
          albumImageUrl: seedTrack.albumImageUrl ?? null,
          uri: seedTrack.uri,
          durationMs: seedTrack.durationMs,
          popularity: seedTrack.popularity,
        },
      ],
      tracks,
      generation: {
        version: 1,
        kind: 'discover_track',
        targetTrackCount: input.targetTrackCount,
        seed: {
          id: seedTrack.id.getValue(),
          name: seedTrack.name,
          artistId: seedTrack.artistId.getValue(),
          artistName: seedTrack.artistName,
          albumImageUrl: seedTrack.albumImageUrl ?? null,
          uri: seedTrack.uri,
          durationMs: seedTrack.durationMs,
          popularity: seedTrack.popularity,
        },
        filters: input.filters,
        popularity: input.popularity,
        orderMode: input.orderMode,
      },
      coverArtwork: pickLinkedCoverArtwork(
        [seedTrack, ...tracks].map(trackCoverSource),
      ),
    });
  }

  private async selectDiverseTracks(
    catalog: CatalogProviderPort,
    seedTrack: Track,
    candidateList: SimilarTrackCandidateList,
    input: TrackDiscoverInput,
    context: TrackSelectionContext,
  ): Promise<Track[]> {
    const target = input.targetTrackCount;
    const minimumTracks = minimumResolvedDiscoverTracks(target);
    const seedArtist = seedArtistName(seedTrack);
    const candidates = candidateList.items;
    const relatedCandidates = candidates.filter(
      (candidate) => !isSeedArtistCandidate(candidate.artistName, seedArtist),
    );
    const seedArtistCandidates = candidates.filter((candidate) =>
      isSeedArtistCandidate(candidate.artistName, seedArtist),
    );
    const reachable =
      relatedCandidates.length +
      seedArtistTrackAllowance(relatedCandidates.length, target);

    if (reachable < minimumTracks) {
      this.logger.debug(
        `Discover track diversity: ${relatedCandidates.length} related candidate(s), ${seedArtistCandidates.length} from the seed artist`,
      );
      throw new BusinessRuleError(
        'Not enough related tracks to build a Discover mix. Try another song.',
        'DISCOVER_NOT_ENOUGH_SIMILAR',
        { seed: seedTrack.name, found: relatedCandidates.length },
      );
    }

    const { relatedTracks, seedArtistTracks } = await this.resolveByArtistShare(
      catalog,
      seedTrack,
      { related: relatedCandidates, seedArtist: seedArtistCandidates },
      candidateList,
      input,
      context,
    );
    context.artistQualifier?.assertEnforceable();
    const allowance = seedArtistTrackAllowance(relatedTracks.length, target);
    const keptSeedArtistTracks = seedArtistTracks.slice(0, allowance);
    const selected = [...relatedTracks, ...keptSeedArtistTracks];

    if (seedArtistTracks.length > 0 || seedArtistCandidates.length > 0) {
      this.logger.debug(
        `Discover track diversity: ${relatedTracks.length} related track(s), kept ${keptSeedArtistTracks.length}/${seedArtistTracks.length} seed-artist track(s) (allowance ${allowance})`,
      );
    }

    if (selected.length >= minimumTracks) {
      return selected;
    }
    if (relatedTracks.length + seedArtistTracks.length >= minimumTracks) {
      throw new BusinessRuleError(
        'Not enough related tracks from other artists to build a Discover mix. Try another song.',
        'DISCOVER_NOT_ENOUGH_SIMILAR',
        { seed: seedTrack.name, found: relatedTracks.length },
      );
    }
    throw new BusinessRuleError(
      'Could not match enough related tracks on Spotify. Try another song.',
      'DISCOVER_RESOLVE_FAILED',
      { seed: seedTrack.name, resolved: selected.length },
    );
  }

  private async resolveByArtistShare(
    catalog: CatalogProviderPort,
    seedTrack: Track,
    candidates: { related: SimilarTrackRef[]; seedArtist: SimilarTrackRef[] },
    candidateList: SimilarTrackCandidateList,
    input: TrackDiscoverInput,
    context: TrackSelectionContext,
  ): Promise<{ relatedTracks: Track[]; seedArtistTracks: Track[] }> {
    const { tracker, acceptTrack, artistQualifier } = context;
    const target = input.targetTrackCount;
    const seedArtistId = seedTrack.artistId.getValue();
    const isRelated = (track: Track) => !isSeedArtistTrack(track, seedArtistId);
    const reportMatched = (matched: number): void => {
      tracker.report(
        'matching_tracks',
        Math.min(matched, target),
        Math.max(1, target),
      );
    };

    reportMatched(0);
    const related = await this.resolveSimilarTracks(
      catalog,
      orderSimilarTrackCandidates(candidates.related, input.popularity, target),
      {
        excludedTrackIds: [seedTrack.id.getValue()],
        limit: target,
        maxAttempts: seedResolveAttemptLimit(target),
        onMatched: reportMatched,
        countsTowardLimit: isRelated,
        acceptTrack,
        artistQualifier,
      },
    );
    const resolved = [
      ...related.tracks,
      ...(await this.resolveSimilarArtistSupplement(
        catalog,
        seedTrack,
        candidateList,
        input,
        {
          resolved: related.tracks,
          attemptsLeft: seedResolveAttemptLimit(target) - related.attempted,
          isRelated,
          reportMatched,
          acceptTrack,
          artistQualifier,
        },
      )),
    ];
    const relatedTracks = resolved.filter(isRelated);
    const seedArtistTracks = resolved.filter((track) => !isRelated(track));
    const missing =
      seedArtistTrackAllowance(relatedTracks.length, target) -
      seedArtistTracks.length;

    if (missing > 0 && candidates.seedArtist.length > 0) {
      const extra = await this.resolveSimilarTracks(
        catalog,
        orderSimilarTrackCandidates(
          candidates.seedArtist,
          input.popularity,
          missing,
        ),
        {
          excludedTrackIds: [
            seedTrack.id.getValue(),
            ...resolved.map((t) => t.id.getValue()),
          ],
          limit: missing,
          maxAttempts: seedResolveAttemptLimit(missing),
          onMatched: (matched) => reportMatched(relatedTracks.length + matched),
          acceptTrack,
          artistQualifier,
        },
      );
      seedArtistTracks.push(...extra.tracks);
    }

    return { relatedTracks, seedArtistTracks };
  }

  private async resolveSimilarArtistSupplement(
    catalog: CatalogProviderPort,
    seedTrack: Track,
    candidateList: SimilarTrackCandidateList,
    input: TrackDiscoverInput,
    state: {
      resolved: Track[];
      attemptsLeft: number;
      isRelated: (track: Track) => boolean;
      reportMatched: (matched: number) => void;
      acceptTrack?: TrackAcceptance;
      artistQualifier: ArtistFilterQualifier | null;
    },
  ): Promise<Track[]> {
    const found = state.resolved.filter(state.isRelated).length;
    const missing = input.targetTrackCount - found;
    if (
      missing <= 0 ||
      state.attemptsLeft <= 0 ||
      candidateList.similarArtistsUsed
    ) {
      return [];
    }

    const seedArtist = seedArtistName(seedTrack);
    const supplement = (
      await this.appendSimilarArtistCandidates(candidateList, seedTrack)
    ).filter(
      (candidate) => !isSeedArtistCandidate(candidate.artistName, seedArtist),
    );
    const more = await this.resolveSimilarTracks(
      catalog,
      orderSimilarTrackCandidates(supplement, input.popularity, missing),
      {
        excludedTrackIds: [
          seedTrack.id.getValue(),
          ...state.resolved.map((t) => t.id.getValue()),
        ],
        limit: missing,
        maxAttempts: state.attemptsLeft,
        onMatched: (matched) => state.reportMatched(found + matched),
        countsTowardLimit: state.isRelated,
        acceptTrack: state.acceptTrack,
        artistQualifier: state.artistQualifier,
      },
    );
    return more.tracks;
  }

  private artistQualifier(input: DiscoverInput): ArtistFilterQualifier | null {
    const filters = artistSelectionFilters(input.filters);
    return hasArtistSelectionFilters(filters)
      ? ArtistFilterQualifier.create(
          this.discoveryCatalog,
          filters,
          this.logger,
        )
      : null;
  }

  private async resolveSeedArtist(
    catalog: CatalogProviderPort,
    input: ArtistDiscoverInput,
  ) {
    const artistId = input.artistId;
    const snapshot = input.artist;
    if (snapshot?.id === artistId) {
      const byId = await catalog.getArtistsByIds([artistId]);
      if (byId[0]) {
        return byId[0];
      }
      const matches = await catalog.searchArtists(snapshot.name, 3);
      const best = pickStrictArtistMatch(snapshot.name, matches);
      if (best) {
        return best;
      }
    }

    const byId = await catalog.getArtistsByIds([artistId]);
    if (byId[0]) {
      return byId[0];
    }

    throw new BusinessRuleError(
      'Seed artist could not be resolved on Spotify.',
      'ARTIST_RESOLVE_FAILED',
      { id: artistId },
    );
  }

  private async resolveSeedTrack(
    catalog: CatalogProviderPort,
    input: TrackDiscoverInput,
  ): Promise<Track> {
    const snapshot = input.track;
    const trackId = input.trackId;

    const hits = await catalog.searchTracks(
      `track:"${snapshot.name}" artist:"${snapshot.artistName}"`,
      { limit: CATALOG_MATCH_SEARCH_LIMIT, offset: 0 },
    );
    const byId = hits.find((t) => t.id.getValue() === trackId);
    if (byId) {
      return byId;
    }

    const resolved = await catalog.resolveTrack(
      snapshot.artistName,
      snapshot.name,
    );
    if (resolved) {
      return resolved;
    }

    if (hits[0]) {
      return hits[0];
    }

    // Last resort: rebuild from client snapshot when search is thin.
    if (snapshot.uri?.startsWith('spotify:track:')) {
      return Track.create({
        id: TrackId.create(trackId),
        name: snapshot.name,
        artistId: ArtistId.create(snapshot.artistId),
        artistName: snapshot.artistName,
        durationMs: snapshot.durationMs ?? 0,
        popularity: readTrackPopularity(snapshot.popularity),
        uri: snapshot.uri,
        albumImageUrl: snapshot.albumImageUrl ?? undefined,
      });
    }

    throw new BusinessRuleError(
      'Seed track could not be resolved on Spotify.',
      'TRACK_RESOLVE_FAILED',
      { id: trackId, name: snapshot.name },
    );
  }

  private async resolveSimilarArtists(
    catalog: CatalogProviderPort,
    candidates: SimilarArtistCandidate[],
    seedId: string,
    limit: number,
    tracker?: GenerationProgressTracker,
    artistQualifier?: ArtistFilterQualifier | null,
  ): Promise<Array<{ id: string; name: string; imageUrl?: string | null }>> {
    const resolved: Array<{
      id: string;
      name: string;
      imageUrl?: string | null;
    }> = [];
    const seen = new Set<string>([seedId]);
    tracker?.report('resolving_seeds', 0, Math.max(1, limit));

    for (const [index, candidate] of candidates.entries()) {
      if (resolved.length >= limit) {
        break;
      }
      if (
        artistQualifier &&
        !(await qualifiesInOrder(artistQualifier, candidates, index, (c) => c))
      ) {
        continue;
      }
      const name = candidate.name;
      const matches = await catalog.searchArtists(
        name,
        SEED_ARTIST_MATCH_CANDIDATES,
      );
      const best = pickUniqueArtistMatch(name, matches);
      if (!best) {
        tracker?.report('resolving_seeds', resolved.length, Math.max(1, limit));
        continue;
      }
      const id = best.id.getValue();
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      resolved.push({
        id,
        name: best.name,
        imageUrl: best.imageUrl ?? null,
      });
      tracker?.report('resolving_seeds', resolved.length, Math.max(1, limit));
    }

    return resolved;
  }

  private async collectSimilarTrackCandidates(
    seedTrack: Track,
    limit: number,
  ): Promise<SimilarTrackCandidateList> {
    const seedArtist = seedArtistName(seedTrack);
    const list = new SimilarTrackCandidateList(seedTrack, seedArtist, limit);

    const similar = await this.discoveryCatalog.getSimilarTracks(
      seedTrack.artistName,
      seedTrack.name,
      limit,
    );
    list.push(
      similar.map((t) => ({
        name: t.name,
        artistName: t.artistName,
        playcount: t.playcount,
      })),
    );

    if (list.relatedCount < DISCOVER_MIN_SIMILAR_TRACKS) {
      this.logger.debug(
        `Discover track fallback: similar artists (have ${list.relatedCount} related)`,
      );
      await this.pushSimilarArtistTracks(list, seedArtist);
    }

    if (list.relatedCount < DISCOVER_MIN_SIMILAR_TRACKS) {
      this.logger.debug(
        `Discover track fallback: seed artist top tracks (have ${list.relatedCount} related)`,
      );
      const top = await this.discoveryCatalog.getTopTracksForArtist(
        { name: seedArtist },
        Math.min(
          DISCOVER_FALLBACK_TOP_TRACKS_MAX,
          Math.max(limit, DISCOVER_FALLBACK_TOP_TRACKS_MIN),
        ),
      );
      list.push(
        top.map((t) => ({
          name: t.trackName,
          artistName: t.artistName,
          playcount: t.playcount,
        })),
      );
    }

    return list;
  }

  /** Later similar-artist candidates when the similar-track answer underfills. */
  private async appendSimilarArtistCandidates(
    list: SimilarTrackCandidateList,
    seedTrack: Track,
  ): Promise<SimilarTrackRef[]> {
    this.logger.debug(
      `Discover track supplement: similar artists (have ${list.relatedCount} related)`,
    );
    try {
      return await this.pushSimilarArtistTracks(
        list,
        seedArtistName(seedTrack),
      );
    } catch (error) {
      this.logger.warn(
        `Last.fm similar artist supplement failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  private async pushSimilarArtistTracks(
    list: SimilarTrackCandidateList,
    seedArtist: string,
  ): Promise<SimilarTrackRef[]> {
    list.similarArtistsUsed = true;
    const added: SimilarTrackRef[] = [];
    const similarArtists = await this.discoveryCatalog.getSimilarArtists(
      seedArtist,
      DISCOVER_FALLBACK_SIMILAR_ARTISTS_LIMIT,
    );
    for (const artist of similarArtists) {
      if (list.isFull) {
        break;
      }
      const top = await this.discoveryCatalog.getTopTracksForArtist(
        artist,
        DISCOVER_FALLBACK_TOP_TRACKS_PER_ARTIST,
      );
      added.push(
        ...list.push(
          top.map((t) => ({
            name: t.trackName,
            artistName: t.artistName || artist.name,
            playcount: t.playcount,
            artist: { name: artist.name, mbid: artist.mbid },
          })),
        ),
      );
    }
    return added;
  }

  private async resolveSimilarTracks(
    catalog: CatalogProviderPort,
    candidates: SimilarTrackRef[],
    options: {
      excludedTrackIds: string[];
      limit: number;
      maxAttempts: number;
      onMatched?: (matched: number) => void;
      countsTowardLimit?: (track: Track) => boolean;
      acceptTrack?: TrackAcceptance;
      artistQualifier?: ArtistFilterQualifier | null;
    },
  ): Promise<{ tracks: Track[]; attempted: number }> {
    const resolved: Track[] = [];
    const seen = new Set<string>(options.excludedTrackIds);
    const countsTowardLimit = options.countsTowardLimit ?? (() => true);
    let counted = 0;
    let attempted = 0;

    for (const [index, candidate] of candidates.entries()) {
      if (counted >= options.limit || attempted >= options.maxAttempts) {
        break;
      }
      if (
        options.artistQualifier &&
        !(await qualifiesInOrder(
          options.artistQualifier,
          candidates,
          index,
          candidateArtist,
        ))
      ) {
        continue;
      }
      attempted += 1;
      const track = await catalog.resolveTrack(
        candidate.artistName,
        candidate.name,
      );
      if (!track) {
        options.onMatched?.(counted);
        continue;
      }
      const id = track.id.getValue();
      if (seen.has(id) || !(options.acceptTrack?.(track) ?? true)) {
        continue;
      }
      seen.add(id);
      resolved.push(track);
      if (countsTowardLimit(track)) {
        counted += 1;
      }
      options.onMatched?.(counted);
    }

    return { tracks: resolved, attempted };
  }
}

class SimilarTrackCandidateList {
  readonly items: SimilarTrackRef[] = [];
  relatedCount = 0;
  similarArtistsUsed = false;
  private readonly seen: Set<string>;

  constructor(
    seedTrack: Track,
    private readonly seedArtist: string,
    private readonly limit: number,
  ) {
    this.seen = new Set([
      normalizeTrackKey(seedTrack.artistName, seedTrack.name),
    ]);
  }

  get isFull(): boolean {
    return this.relatedCount >= this.limit;
  }

  push(items: SimilarTrackRef[]): SimilarTrackRef[] {
    const added: SimilarTrackRef[] = [];
    for (const item of items) {
      if (this.isFull) {
        break;
      }
      const name = item.name.trim();
      const artistName = item.artistName.trim();
      if (!name || !artistName) {
        continue;
      }
      const key = normalizeTrackKey(artistName, name);
      if (this.seen.has(key)) {
        continue;
      }
      this.seen.add(key);
      const candidate = {
        name,
        artistName,
        playcount: item.playcount,
        artist: item.artist,
      };
      this.items.push(candidate);
      added.push(candidate);
      if (!isSeedArtistCandidate(artistName, this.seedArtist)) {
        this.relatedCount += 1;
      }
    }
    return added;
  }
}

type TrackSelectionContext = {
  tracker: GenerationProgressTracker;
  acceptTrack?: TrackAcceptance;
  artistQualifier: ArtistFilterQualifier | null;
};

function candidateArtist(candidate: SimilarTrackRef): DiscoveryArtistIdentity {
  return (
    candidate.artist ?? {
      name: primaryArtistName(candidate.artistName) || candidate.artistName,
    }
  );
}

async function qualifiesInOrder<T>(
  qualifier: ArtistFilterQualifier,
  candidates: readonly T[],
  index: number,
  identityOf: (candidate: T) => DiscoveryArtistIdentity,
): Promise<boolean> {
  await qualifier.prefetch(
    candidates
      .slice(index, index + ARTIST_FILTER_QUALIFICATION_CONCURRENCY)
      .map(identityOf),
  );
  return qualifier.qualifies(identityOf(candidates[index]));
}

function seedArtistName(seedTrack: Track): string {
  return primaryArtistName(seedTrack.artistName) || seedTrack.artistName;
}

function normalizeTrackKey(artistName: string, trackName: string): string {
  return `${normalizeArtistName(artistName)}|${normalizeArtistName(trackName)}`;
}

function groupTracksByArtist(tracks: Track[]): Map<string, Track[]> {
  const map = new Map<string, Track[]>();
  for (const track of tracks) {
    const key = track.artistId.getValue();
    const list = map.get(key) ?? [];
    list.push(track);
    map.set(key, list);
  }
  return map;
}
