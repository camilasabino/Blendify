import { MAX_ARTISTS } from '../constants';

/** Similar artists fetched from Last.fm (over-fetch for resolve misses). */
export const DISCOVER_SIMILAR_FETCH = 40;
export const DISCOVER_MIN_SIMILAR = 2;
export const DISCOVER_MIN_SIMILAR_TRACKS = 4;
export const DISCOVER_SIMILAR_TRACK_FETCH = 100;

/**
 * How many similar artists to include (seed is excluded from the mix).
 * Prefer more artists × fewer tracks so the playlist stays diverse.
 */
export function discoverSimilarTargetForTracks(trackTarget: number): number {
  return Math.min(MAX_ARTISTS, Math.max(DISCOVER_MIN_SIMILAR, trackTarget));
}

/**
 * Per-artist fetch size. May slightly overshoot the total target;
 * callers trim with maxTracks so the playlist hits the chosen size.
 */
export function tracksPerSeedForDiscoverTarget(
  trackTarget: number,
  artistCount: number,
  maxPerArtist: number,
): number {
  if (artistCount <= 0) return 1;
  const raw = Math.ceil(trackTarget / artistCount);
  return Math.min(maxPerArtist, Math.max(1, raw));
}

export function buildDiscoverPlaylistName(seedName: string): string {
  const seed = seedName.trim() || 'Discover';
  return truncate(`Blendify · Discover · ${seed}`);
}

export function buildDiscoverPlaylistDescription(input: {
  seedName: string;
  seedType?: 'artist' | 'track';
  artistName?: string;
}): string {
  const seed = input.seedName.trim() || 'this pick';
  if (input.seedType === 'track') {
    const artist = input.artistName?.trim();
    const core = artist
      ? `Around “${seed}” by ${artist}. Made with Blendify.`
      : `Around “${seed}”. Made with Blendify.`;
    return truncate(core, 300);
  }
  return truncate(`In the orbit of ${seed}. Made with Blendify.`, 300);
}

function truncate(value: string, max = 100): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
