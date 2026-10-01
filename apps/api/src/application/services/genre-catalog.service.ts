import { Injectable } from '@nestjs/common';
import {
  GENRE_CATALOG,
  getExploreSuggestions,
  listMainGenres,
  type CatalogGenre,
} from '@/domain/genre/genre-catalog';
import { searchGenres } from '@/domain/genre/genre-search';

@Injectable()
export class GenreCatalogService {
  listAll(): readonly CatalogGenre[] {
    return GENRE_CATALOG;
  }

  listMain(): CatalogGenre[] {
    return listMainGenres();
  }

  search(
    query: string,
    options: { offset?: number; limit?: number } = {},
  ): CatalogGenre[] {
    const offset = Math.max(0, options.offset ?? 0);
    const limit = Math.min(16, Math.max(1, options.limit ?? 8));
    return searchGenres(query, offset + limit).slice(offset, offset + limit);
  }

  explore(
    selectedIds: string[],
    options: { limit?: number; offset?: number } = {},
  ): { genres: CatalogGenre[]; hasMore: boolean } {
    return getExploreSuggestions(selectedIds, options);
  }
}
