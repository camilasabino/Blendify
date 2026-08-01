import { Injectable } from '@nestjs/common';
import {
  CURATED_GENRES,
  getExploreSuggestions,
  listMainGenres,
  searchCuratedGenres,
  type CuratedGenre,
} from '../../domain/genre/curated-genres';

@Injectable()
export class GenreCatalogService {
  listAll(): CuratedGenre[] {
    return CURATED_GENRES;
  }

  listMain(): CuratedGenre[] {
    return listMainGenres();
  }

  search(
    query: string,
    options: { offset?: number; limit?: number } = {},
  ): CuratedGenre[] {
    const offset = Math.max(0, options.offset ?? 0);
    const limit = Math.min(16, Math.max(1, options.limit ?? 8));
    return searchCuratedGenres(query, offset + limit).slice(
      offset,
      offset + limit,
    );
  }

  explore(
    selectedIds: string[],
    options: { limit?: number; offset?: number } = {},
  ): { genres: CuratedGenre[]; hasMore: boolean } {
    return getExploreSuggestions(selectedIds, options);
  }
}
