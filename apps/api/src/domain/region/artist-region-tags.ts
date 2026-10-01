import type { MusicRegion } from '@blendify/contracts';
import { isSignificantArtistTag } from '@/domain/discovery/artist-tag-significance';
import type { ArtistTagCandidate } from '@/domain/repositories/discovery-catalog.port';

// Canonical region values are the curated Last.fm scene tags themselves.
export function musicRegionTag(region: MusicRegion): string {
  return region;
}

export function artistTagsMatchRegion(
  tags: readonly ArtistTagCandidate[],
  region: MusicRegion,
): boolean {
  const regionTag = musicRegionTag(region);

  return tags.some(
    (tag) =>
      isSignificantArtistTag(tag) &&
      tag.name.trim().toLowerCase() === regionTag,
  );
}
