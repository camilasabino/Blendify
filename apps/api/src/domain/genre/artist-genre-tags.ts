import type { ArtistTagCandidate } from '@/domain/repositories/discovery-catalog.port';
import { findGenre } from './genre-catalog';

// Last.fm scales tag counts to 0–100 relative to the artist's top tag; low
// counts are stray user tags rather than the artist's style.
const MIN_ARTIST_TAG_WEIGHT = 10;

export function artistTagsMatchGenre(
  tags: readonly ArtistTagCandidate[],
  genreId: string,
): boolean {
  return tags.some(
    (tag) =>
      tag.count >= MIN_ARTIST_TAG_WEIGHT && findGenre(tag.name)?.id === genreId,
  );
}
