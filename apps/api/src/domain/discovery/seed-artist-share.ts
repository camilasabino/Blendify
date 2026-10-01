import { normalizeArtistName } from '@/domain/artist/artist-name-match';
import type { Track } from '@/domain/track/track.entity';
import { artistNameVariants } from './similar-track-query';

const RELATED_TRACKS_PER_SEED_ARTIST_TRACK = 3;

export function seedArtistTrackAllowance(
  relatedTrackCount: number,
  targetTrackCount: number,
): number {
  const openSlots = targetTrackCount - relatedTrackCount;
  const shareCap = Math.floor(
    relatedTrackCount / RELATED_TRACKS_PER_SEED_ARTIST_TRACK,
  );
  return Math.max(0, Math.min(openSlots, shareCap));
}

export function isSeedArtistCandidate(
  artistName: string,
  seedArtistName: string,
): boolean {
  const seedKey = normalizeArtistName(seedArtistName);
  return artistNameVariants(artistName).some(
    (variant) => normalizeArtistName(variant) === seedKey,
  );
}

export function isSeedArtistTrack(track: Track, seedArtistId: string): boolean {
  return (
    track.artistId.getValue() === seedArtistId ||
    track.artists.some((artist) => artist.id === seedArtistId)
  );
}
