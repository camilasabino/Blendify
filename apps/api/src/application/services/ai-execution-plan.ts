import {
  AI_DEFAULT_ORDER_MODE,
  AI_DEFAULT_POPULARITY,
  type AiIntent,
} from '@/domain/ai/ai-intent';
import type { ResolvedAiSeeds } from '@/domain/ai/ai-resolved-seeds';
import { aiSelectionFilters } from '@/domain/ai/ai-selection-filters';
import { candidateTrackCountForDuration } from '@/domain/ai/ai-target-duration';
import type { AiExclusions } from '@/domain/ai/ai-track-selection';
import { maxTracksPerSeedForCount } from '@/domain/constants';
import { moodGenreIds } from '@/domain/genre/mood-genres';
import type { PlaylistGenerationRequest } from '@/application/use-cases/generate-playlist.use-case';

const DEFAULT_ARTIST_MIX_TRACKS_PER_SEED = 10;
const DEFAULT_GENRE_MIX_TRACKS_PER_SEED = 25;
const DEFAULT_DISCOVER_TRACK_TARGET = 30;
const AI_DISCOVER_TRACK_PRESETS = [15, 30, 50] as const;

export interface AiExecutionPlan {
  request: PlaylistGenerationRequest;
  targetTrackCount: number | null;
  targetDurationMinutes: number | null;
  exclusions: AiExclusions;
}

export function buildAiExecutionPlan(
  intent: AiIntent,
  seeds: ResolvedAiSeeds,
  candidateCount: number | null = candidateTrackCount(intent),
): AiExecutionPlan {
  return {
    request: generationRequest(intent, seeds, candidateCount),
    targetTrackCount: intent.targetTrackCount,
    targetDurationMinutes: intent.targetDurationMinutes,
    exclusions: {
      artists: intent.excludeArtists,
      tracks: intent.excludeTracks,
    },
  };
}

export function candidateTrackCount(intent: AiIntent): number | null {
  if (intent.targetTrackCount !== null) {
    return intent.targetTrackCount;
  }
  if (intent.targetDurationMinutes !== null) {
    return candidateTrackCountForDuration(intent.targetDurationMinutes);
  }
  return null;
}

function generationRequest(
  intent: AiIntent,
  seeds: ResolvedAiSeeds,
  candidateCount: number | null,
): PlaylistGenerationRequest {
  const settings = {
    name: '',
    description: '',
    popularity: intent.popularity ?? AI_DEFAULT_POPULARITY,
    orderMode: intent.orderMode ?? AI_DEFAULT_ORDER_MODE,
  };

  switch (intent.kind) {
    case 'artist_mix':
      return {
        ...settings,
        kind: 'artist_mix',
        artistIds: seeds.artists.map((artist) => artist.id),
        artists: seeds.artists.map((artist) => ({
          id: artist.id,
          name: artist.name,
          imageUrl: artist.imageUrl ?? null,
        })),
        filters: aiSelectionFilters(intent),
        tracksPerSeed: tracksPerSeed(
          seeds.artists.length,
          candidateCount,
          DEFAULT_ARTIST_MIX_TRACKS_PER_SEED,
        ),
      };
    case 'genre_mix': {
      const genreIds = genreSeedIds(intent, seeds);
      return {
        ...settings,
        kind: 'genre_mix',
        genreIds,
        filters: aiSelectionFilters(intent),
        tracksPerSeed: tracksPerSeed(
          genreIds.length,
          candidateCount,
          DEFAULT_GENRE_MIX_TRACKS_PER_SEED,
        ),
      };
    }
    case 'discover_artist': {
      const [artist] = seeds.artists;
      return {
        ...settings,
        kind: 'discover_artist',
        artistId: artist.id,
        artist: {
          id: artist.id,
          name: artist.name,
          imageUrl: artist.imageUrl ?? null,
        },
        targetTrackCount: discoverTarget(candidateCount),
        filters: aiSelectionFilters(intent),
      };
    }
    case 'discover_track': {
      const track = requiredTrackSeed(seeds);
      return {
        ...settings,
        kind: 'discover_track',
        trackId: track.id,
        track: {
          id: track.id,
          name: track.name,
          artistId: track.artistId,
          artistName: track.artistName,
          albumImageUrl: track.imageUrl ?? null,
          uri: track.uri,
          durationMs: track.durationMs,
          popularity: track.popularity,
        },
        targetTrackCount: discoverTarget(candidateCount),
        filters: aiSelectionFilters(intent),
      };
    }
  }
}

function genreSeedIds(intent: AiIntent, seeds: ResolvedAiSeeds): string[] {
  if (seeds.genres.length > 0 || intent.mood === null) {
    return seeds.genres.map((genre) => genre.id);
  }
  return [...moodGenreIds(intent.mood)];
}

function tracksPerSeed(
  seedCount: number,
  candidateCount: number | null,
  defaultPerSeed: number,
): number {
  const maxPerSeed = maxTracksPerSeedForCount(seedCount);

  if (candidateCount === null) {
    return Math.min(defaultPerSeed, maxPerSeed);
  }
  return Math.min(maxPerSeed, Math.ceil(candidateCount / seedCount));
}

function discoverTarget(candidateCount: number | null): number {
  if (candidateCount === null) {
    return DEFAULT_DISCOVER_TRACK_TARGET;
  }
  return (
    AI_DISCOVER_TRACK_PRESETS.find((target) => target >= candidateCount) ??
    AI_DISCOVER_TRACK_PRESETS[AI_DISCOVER_TRACK_PRESETS.length - 1]
  );
}

function requiredTrackSeed(seeds: ResolvedAiSeeds) {
  if (!seeds.track) {
    throw new Error('A resolved seed track is required for track discovery.');
  }
  return seeds.track;
}
