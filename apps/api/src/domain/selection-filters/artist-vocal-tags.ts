import { isSignificantArtistTag } from '@/domain/discovery/artist-tag-significance';
import type { ArtistTagCandidate } from '@/domain/repositories/discovery-catalog.port';

// Last.fm's curated vocal-style tag: describes the vocals heard in the music,
// never the gender or line-up of the artist.
const FEMALE_VOCALS_TAG = 'female vocalists';

export function artistTagsMatchFemaleVocals(
  tags: readonly ArtistTagCandidate[],
): boolean {
  return tags.some(
    (tag) =>
      isSignificantArtistTag(tag) &&
      tag.name.trim().toLowerCase() === FEMALE_VOCALS_TAG,
  );
}
