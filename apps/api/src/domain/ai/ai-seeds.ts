import type { AiSeedType, PlaylistKind } from '@blendify/contracts';
import { MAX_ARTISTS, MAX_GENRES } from '@/domain/constants';
import type { AiIntent } from './ai-intent';

export const DISCOVER_SEED_LIMIT = 1;

const SEED_TYPE_BY_KIND: Record<PlaylistKind, AiSeedType> = {
  artist_mix: 'artist',
  discover_artist: 'artist',
  genre_mix: 'genre',
  discover_track: 'track',
};

const SEED_LIMIT_BY_KIND: Record<PlaylistKind, number> = {
  artist_mix: MAX_ARTISTS,
  genre_mix: MAX_GENRES,
  discover_artist: DISCOVER_SEED_LIMIT,
  discover_track: DISCOVER_SEED_LIMIT,
};

export function seedTypeOfKind(kind: PlaylistKind): AiSeedType {
  return SEED_TYPE_BY_KIND[kind];
}

export function seedLimitOfKind(kind: PlaylistKind): number {
  return SEED_LIMIT_BY_KIND[kind];
}

export function isDiscoverKind(kind: PlaylistKind): boolean {
  return kind === 'discover_artist' || kind === 'discover_track';
}

export function kindForSeedType(
  seedType: AiSeedType,
  requestedKind: PlaylistKind,
): PlaylistKind {
  switch (seedType) {
    case 'genre':
      return 'genre_mix';
    case 'track':
      return 'discover_track';
    case 'artist':
      return isDiscoverKind(requestedKind) ? 'discover_artist' : 'artist_mix';
  }
}

export function presentSeedTypes(intent: AiIntent): AiSeedType[] {
  const present: AiSeedType[] = [];

  if (intent.artists.length > 0) {
    present.push('artist');
  }
  if (intent.genres.length > 0) {
    present.push('genre');
  }
  if (intent.seedTracks.length > 0) {
    present.push('track');
  }
  return present;
}

export function seedLabels(intent: AiIntent, seedType: AiSeedType): string[] {
  switch (seedType) {
    case 'artist':
      return intent.artists;
    case 'genre':
      return intent.genres;
    case 'track':
      return intent.seedTracks.map((track) =>
        track.artist ? `${track.title} — ${track.artist}` : track.title,
      );
  }
}
