import type { SelectionFilters } from '@blendify/contracts';
import { artistTagsMatchRegion } from '@/domain/region/artist-region-tags';
import type { ArtistTagCandidate } from '@/domain/repositories/discovery-catalog.port';
import { artistTagsMatchFemaleVocals } from './artist-vocal-tags';

export type ArtistSelectionFilters = Pick<
  SelectionFilters,
  'region' | 'femaleVocals'
>;

export function artistSelectionFilters(
  filters: SelectionFilters,
): ArtistSelectionFilters {
  return { region: filters.region, femaleVocals: filters.femaleVocals };
}

export function hasArtistSelectionFilters(
  filters: ArtistSelectionFilters,
): boolean {
  return filters.region !== null || filters.femaleVocals;
}

export function artistTagsSatisfyFilters(
  tags: readonly ArtistTagCandidate[],
  filters: ArtistSelectionFilters,
): boolean {
  return (
    (filters.region === null || artistTagsMatchRegion(tags, filters.region)) &&
    (!filters.femaleVocals || artistTagsMatchFemaleVocals(tags))
  );
}
