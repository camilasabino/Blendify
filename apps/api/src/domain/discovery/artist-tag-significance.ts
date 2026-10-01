import type { ArtistTagCandidate } from '@/domain/repositories/discovery-catalog.port';

// Last.fm scales tag counts to 0–100 relative to the artist's top tag; low
// counts are stray user tags rather than the artist's style or scene.
const MIN_ARTIST_TAG_WEIGHT = 10;

export function isSignificantArtistTag(tag: ArtistTagCandidate): boolean {
  return tag.count >= MIN_ARTIST_TAG_WEIGHT;
}
