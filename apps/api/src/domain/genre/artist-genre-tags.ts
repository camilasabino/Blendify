import { isSignificantArtistTag } from '@/domain/discovery/artist-tag-significance';
import type { ArtistTagCandidate } from '@/domain/repositories/discovery-catalog.port';
import { findGenre } from './genre-catalog';

export function artistTagsMatchGenre(
  tags: readonly ArtistTagCandidate[],
  genreId: string,
): boolean {
  return tags.some(
    (tag) => isSignificantArtistTag(tag) && findGenre(tag.name)?.id === genreId,
  );
}
