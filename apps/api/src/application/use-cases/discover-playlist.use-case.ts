import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import { PopularityMode, type PlaylistDetail } from '@blendify/contracts';
import type { z } from 'zod';
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
import {
  normalizeArtistName,
  pickStrictArtistMatch,
} from '../../domain/artist/artist-name-match';
import { ArtistId } from '../../domain/value-objects/artist-id.vo';
import { Track } from '../../domain/track/track.entity';
import { TrackId } from '../../domain/value-objects/track-id.vo';
import { Playlist } from '../../domain/playlist/playlist.entity';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import { maxTracksPerSeedForCount } from '../../domain/constants';
import {
  preferPopularTracks,
  preferRareTracks,
} from '../../domain/genre/artist-mix-queries';
import { catalogCandidateBudget } from '../../domain/genre/catalog-window';
import {
  DISCOVER_MIN_SIMILAR,
  DISCOVER_MIN_SIMILAR_TRACKS,
  DISCOVER_SIMILAR_FETCH,
  DISCOVER_SIMILAR_TRACK_FETCH,
  buildDiscoverPlaylistDescription,
  buildDiscoverPlaylistName,
  discoverSimilarTargetForTracks,
  tracksPerSeedForDiscoverTarget,
} from '../../domain/playlist/discover-playlist-name';
import { primaryArtistName } from '../../domain/discovery/similar-track-query';
import { createOrderingStrategy } from '../../domain/services/strategies/track-ordering.strategy';
import {
  DiscoverPlaylistDto,
  DiscoverPlaylistSchema,
} from '../dto/discover-playlist.dto';
import { GeneratePlaylistUseCase } from './generate-playlist.use-case';
import { PublishPlaylistService } from '../services/publish-playlist.service';
import {
  GenerationProgressTracker,
  monotonicProgressReporter,
  type ProgressReporter,
} from '../services/generation-progress.tracker';

type DiscoverInput = z.output<typeof DiscoverPlaylistSchema>;
type ArtistDiscoverInput = Extract<DiscoverInput, { kind: 'discover_artist' }>;
type TrackDiscoverInput = Extract<DiscoverInput, { kind: 'discover_track' }>;

@Injectable()
export class DiscoverPlaylistUseCase {
  private readonly logger = new Logger(DiscoverPlaylistUseCase.name);

  constructor(
    private readonly generate: GeneratePlaylistUseCase,
    @Inject(DISCOVERY_CATALOG)
    private readonly discoveryCatalog: DiscoveryCatalogPort,
    @Inject(MUSIC_PROVIDER_FACTORY)
    private readonly providers: MusicProviderFactoryPort,
    @Inject(PROVIDER_QUOTA) private readonly quota: ProviderQuotaPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(USAGE_STATS_REPOSITORY)
    private readonly usageStats: UsageStatsRepositoryPort,
    private readonly publisher: PublishPlaylistService,
  ) {}

  async execute(
    raw: DiscoverPlaylistDto,
    options?: { onProgress?: ProgressReporter },
  ): Promise<PlaylistDetail> {
    const input = DiscoverPlaylistSchema.parse(raw);
    const onProgress = monotonicProgressReporter(options?.onProgress);

    if (!this.discoveryCatalog.isConfigured()) {
      throw new BusinessRuleError(
        'Last.fm API key is not configured.',
        'LASTFM_NOT_CONFIGURED',
      );
    }

    if (input.kind === 'discover_track') {
      return this.executeFromTrack(input, onProgress);
    }
    return this.executeFromArtist(input, onProgress);
  }

  private async executeFromArtist(
    input: ArtistDiscoverInput,
    onProgress?: ProgressReporter,
  ): Promise<PlaylistDetail> {
    const tracker = new GenerationProgressTracker(onProgress);
    const provider = this.providers.forUser(input.userId);
    tracker.report('resolving_seeds', 0, 1);
    const seed = await this.resolveSeedArtist(provider, input);
    tracker.report('resolving_seeds', 1, 1);

    let similarNames: string[];
    try {
      const similar = await this.discoveryCatalog.getSimilarArtists(
        seed.name,
        DISCOVER_SIMILAR_FETCH,
      );
      const seedKey = normalizeArtistName(seed.name);
      similarNames = similar
        .map((a) => a.name.trim())
        .filter((name) => name && normalizeArtistName(name) !== seedKey);
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

    if (similarNames.length < DISCOVER_MIN_SIMILAR) {
      throw new BusinessRuleError(
        'Not enough similar artists to build a Discover mix. Try another seed.',
        'DISCOVER_NOT_ENOUGH_SIMILAR',
        { seed: seed.name, found: similarNames.length },
      );
    }

    const similarTarget = discoverSimilarTargetForTracks(
      input.targetTrackCount,
    );
    const resolvedSimilar = await this.resolveSimilarArtists(
      provider,
      similarNames,
      seed.id.getValue(),
      similarTarget,
      tracker,
    );

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
      `Discover artist mix for "${seed.name}": target ${input.targetTrackCount}, ${artists.length} artist(s), ${tracksPerSeed} track(s)/artist`,
    );

    const playlist = await this.generate.execute(
      {
        userId: input.userId,
        kind: 'artist_mix',
        name,
        description,
        artistIds: artists.map((a) => a.id),
        artists,
        tracksPerSeed,
        popularity: input.popularity,
        orderMode: input.orderMode,
        coverImageBase64: input.coverImageBase64,
        persistToLibrary: input.persistToLibrary,
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
          popularity: input.popularity,
          orderMode: input.orderMode,
        },
        usageSeeds: [
          {
            id: seed.id.getValue(),
            name: seed.name,
            imageUrl: seed.imageUrl ?? null,
          },
        ],
      },
      { onProgress },
    );

    return playlist;
  }

  private async executeFromTrack(
    input: TrackDiscoverInput,
    onProgress?: ProgressReporter,
  ): Promise<PlaylistDetail> {
    const tracker = new GenerationProgressTracker(onProgress);
    const user = await this.users.findById(input.userId);
    if (!user) {
      throw new BusinessRuleError('User not found', 'USER_NOT_FOUND');
    }

    this.quota.assertAvailable();

    const provider = this.providers.forUser(input.userId);
    tracker.report('resolving_seeds', 0, 1);
    const seedTrack = await this.resolveSeedTrack(provider, input);
    tracker.report('resolving_seeds', 1, 1);

    let similarRaw: Array<{ name: string; artistName: string }>;
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

    if (similarRaw.length < DISCOVER_MIN_SIMILAR_TRACKS) {
      throw new BusinessRuleError(
        'Not enough related tracks to build a Discover mix. Try another song.',
        'DISCOVER_NOT_ENOUGH_SIMILAR',
        { seed: seedTrack.name, found: similarRaw.length },
      );
    }

    const neededSimilar = input.targetTrackCount;
    const resolveBudget = catalogCandidateBudget(neededSimilar);
    tracker.report('matching_tracks', 0, Math.max(1, neededSimilar));
    const resolvedSimilar = await this.resolveSimilarTracks(
      provider,
      similarRaw.slice(0, resolveBudget),
      seedTrack.id.getValue(),
      resolveBudget,
      (matched) => {
        tracker.report(
          'matching_tracks',
          Math.min(matched, neededSimilar),
          Math.max(1, neededSimilar),
        );
      },
    );

    if (resolvedSimilar.length < DISCOVER_MIN_SIMILAR_TRACKS) {
      throw new BusinessRuleError(
        'Could not match enough related tracks on Spotify. Try another song.',
        'DISCOVER_RESOLVE_FAILED',
        { seed: seedTrack.name, resolved: resolvedSimilar.length },
      );
    }

    const filteredSimilar = selectTracksByPopularity(
      resolvedSimilar,
      neededSimilar,
      input.popularity,
    );

    const tracksByArtist = groupTracksByArtist(filteredSimilar);
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
      `Discover track mix for "${seedTrack.name}": ${tracks.length}/${input.targetTrackCount}`,
    );

    const playlist = Playlist.create({
      id: randomUUID(),
      userId: user.id,
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
        popularity: input.popularity,
        orderMode: input.orderMode,
      },
    });
    const response = await this.publisher.execute({
      playlist,
      provider,
      spotifyUserId: user.spotifyId,
      coverImageBase64: input.coverImageBase64,
      fallbackImageUrl:
        seedTrack.albumImageUrl ??
        tracks.find((track) => track.albumImageUrl)?.albumImageUrl,
      persistToLibrary: input.persistToLibrary,
      onProgress,
    });

    try {
      await this.usageStats.recordMix({
        userId: user.id,
        kind: 'artist',
        seeds: [
          {
            kind: 'artist' as const,
            seedKey: seedTrack.artistId.getValue(),
            name: seedTrack.artistName,
            imageUrl: seedTrack.albumImageUrl ?? null,
          },
        ],
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

  private async resolveSeedArtist(
    provider: MusicProviderPort,
    input: ArtistDiscoverInput,
  ) {
    const artistId = input.artistId;
    const snapshot = input.artist;
    if (snapshot && snapshot.id === artistId) {
      const byId = await provider.getArtistsByIds([artistId]);
      if (byId[0]) return byId[0];
      const matches = await provider.searchArtists(snapshot.name, 3);
      const best = pickStrictArtistMatch(snapshot.name, matches);
      if (best) return best;
    }

    const byId = await provider.getArtistsByIds([artistId]);
    if (byId[0]) return byId[0];

    throw new BusinessRuleError(
      'Seed artist could not be resolved on Spotify.',
      'ARTIST_RESOLVE_FAILED',
      { id: artistId },
    );
  }

  private async resolveSeedTrack(
    provider: MusicProviderPort,
    input: TrackDiscoverInput,
  ): Promise<Track> {
    const snapshot = input.track;
    const trackId = input.trackId;

    const hits = await provider.searchTracks(
      `track:"${snapshot.name}" artist:"${snapshot.artistName}"`,
      { limit: 10, offset: 0 },
    );
    const byId = hits.find((t) => t.id.getValue() === trackId);
    if (byId) return byId;

    const resolved = await provider.resolveTrack(
      snapshot.artistName,
      snapshot.name,
    );
    if (resolved) return resolved;

    if (hits[0]) return hits[0];

    // Last resort: rebuild from client snapshot when search is thin.
    if (snapshot.uri?.startsWith('spotify:track:')) {
      return Track.create({
        id: TrackId.create(trackId),
        name: snapshot.name,
        artistId: ArtistId.create(snapshot.artistId),
        artistName: snapshot.artistName,
        durationMs: snapshot.durationMs ?? 0,
        popularity: snapshot.popularity ?? 0,
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
    provider: MusicProviderPort,
    names: string[],
    seedId: string,
    limit: number,
    tracker?: GenerationProgressTracker,
  ): Promise<Array<{ id: string; name: string; imageUrl?: string | null }>> {
    const resolved: Array<{
      id: string;
      name: string;
      imageUrl?: string | null;
    }> = [];
    const seen = new Set<string>([seedId]);
    tracker?.report('resolving_seeds', 0, Math.max(1, limit));

    for (const name of names) {
      if (resolved.length >= limit) break;
      const matches = await provider.searchArtists(name, 3);
      const best = pickStrictArtistMatch(name, matches);
      if (!best) {
        tracker?.report('resolving_seeds', resolved.length, Math.max(1, limit));
        continue;
      }
      const id = best.id.getValue();
      if (seen.has(id)) continue;
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
  ): Promise<Array<{ name: string; artistName: string }>> {
    const seedKey = normalizeTrackKey(seedTrack.artistName, seedTrack.name);
    const seen = new Set<string>([seedKey]);
    const out: Array<{ name: string; artistName: string }> = [];

    const push = (items: Array<{ name: string; artistName: string }>): void => {
      for (const item of items) {
        if (out.length >= limit) return;
        const name = item.name.trim();
        const artistName = item.artistName.trim();
        if (!name || !artistName) continue;
        const key = normalizeTrackKey(artistName, name);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ name, artistName });
      }
    };

    const similar = await this.discoveryCatalog.getSimilarTracks(
      seedTrack.artistName,
      seedTrack.name,
      limit,
    );
    push(
      similar.map((t) => ({
        name: t.name,
        artistName: t.artistName,
      })),
    );

    const seedArtist =
      primaryArtistName(seedTrack.artistName) || seedTrack.artistName;

    if (out.length < DISCOVER_MIN_SIMILAR_TRACKS) {
      this.logger.debug(
        `Discover track fallback: top tracks for "${seedArtist}" (have ${out.length})`,
      );
      const top = await this.discoveryCatalog.getTopTracksForArtist(
        seedArtist,
        Math.min(50, Math.max(limit, 20)),
      );
      push(
        top.map((t) => ({
          name: t.trackName,
          artistName: t.artistName,
        })),
      );
    }

    if (out.length < DISCOVER_MIN_SIMILAR_TRACKS) {
      this.logger.debug(
        `Discover track fallback: similar artists for "${seedArtist}" (have ${out.length})`,
      );
      const similarArtists = await this.discoveryCatalog.getSimilarArtists(
        seedArtist,
        12,
      );
      for (const artist of similarArtists) {
        if (out.length >= limit) break;
        const top = await this.discoveryCatalog.getTopTracksForArtist(
          artist.name,
          8,
        );
        push(
          top.map((t) => ({
            name: t.trackName,
            artistName: t.artistName || artist.name,
          })),
        );
      }
    }

    return out;
  }

  private async resolveSimilarTracks(
    provider: MusicProviderPort,
    candidates: Array<{ name: string; artistName: string }>,
    seedTrackId: string,
    limit: number,
    onMatched?: (matched: number) => void,
  ): Promise<Track[]> {
    const resolved: Track[] = [];
    const seen = new Set<string>([seedTrackId]);

    for (const candidate of candidates) {
      if (resolved.length >= limit) break;
      const track = await provider.resolveTrack(
        candidate.artistName,
        candidate.name,
      );
      if (!track) {
        onMatched?.(resolved.length);
        continue;
      }
      const id = track.id.getValue();
      if (seen.has(id)) continue;
      seen.add(id);
      resolved.push(track);
      onMatched?.(resolved.length);
    }

    return resolved;
  }
}

function normalizeTrackKey(artistName: string, trackName: string): string {
  return `${normalizeArtistName(artistName)}|${normalizeArtistName(trackName)}`;
}

function selectTracksByPopularity(
  tracks: Track[],
  needed: number,
  popularity: PopularityMode,
): Track[] {
  switch (popularity) {
    case PopularityMode.POPULAR:
      return preferPopularTracks(tracks, needed).slice(0, needed);
    case PopularityMode.RARITIES:
      return preferRareTracks(tracks, needed).slice(0, needed);
    case PopularityMode.BALANCED:
    default: {
      // Keep Last.fm similarity order with a light shuffle of the middle.
      const copy = [...tracks];
      if (copy.length > 4) {
        const head = copy.slice(0, 2);
        const mid = copy.slice(2, -1);
        const tail = copy.slice(-1);
        for (let i = mid.length - 1; i > 0; i -= 1) {
          const j = randomInt(0, i + 1);
          const current = mid[i];
          const swap = mid[j];
          if (current === undefined || swap === undefined) continue;
          mid[i] = swap;
          mid[j] = current;
        }
        return [...head, ...mid, ...tail].slice(0, needed);
      }
      return copy.slice(0, needed);
    }
  }
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
