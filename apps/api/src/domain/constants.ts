import { MAX_ARTISTS, MAX_GENRES, MAX_TRACKS } from '@blendify/contracts';

export { MAX_ARTISTS, MAX_GENRES, MAX_TRACKS };

export function maxTracksPerSeedForCount(seedCount: number): number {
  if (seedCount <= 0) return MAX_TRACKS;
  return Math.min(MAX_TRACKS, Math.floor(MAX_TRACKS / seedCount));
}

export const ALTERNATE_KEYWORDS = [
  'Live',
  'Acoustic',
  'Remastered',
  'Deluxe',
  'Anniversary',
  'Radio Edit',
  'Demo',
] as const;
