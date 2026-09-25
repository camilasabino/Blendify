import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GenreCatalogService } from '../../application/services/genre-catalog.service';
import { toGenreDto } from '../../domain/genre/curated-genres';
import { SearchQuerySchema, type SearchQuery } from '@blendify/contracts';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';

@ApiTags('genres')
@Controller('api/genres')
export class GenresController {
  constructor(private readonly catalog: GenreCatalogService) {}

  @Get()
  @ApiOperation({ summary: 'List curated genres' })
  list() {
    return { genres: this.catalog.listMain().map(toGenreDto) };
  }

  @Get('search')
  @ApiOperation({ summary: 'Search curated genres' })
  search(@Query(new ZodValidationPipe(SearchQuerySchema)) query: SearchQuery) {
    return {
      genres: this.catalog
        .search(query.q, { offset: query.offset, limit: query.limit })
        .map(toGenreDto),
    };
  }

  @Get('explore')
  @ApiOperation({ summary: 'Suggest genres related to selected genres' })
  explore(
    @Query('ids') ids = '',
    @Query('offset') offsetRaw?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const selectedIds = ids
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const result = this.catalog.explore(
      selectedIds,
      parsePage(offsetRaw, limitRaw),
    );
    return {
      genres: result.genres.map(toGenreDto),
      hasMore: result.hasMore,
    };
  }
}

function parsePage(offsetRaw?: string, limitRaw?: string) {
  const offset = Number.parseInt(offsetRaw ?? '0', 10);
  const limit = Number.parseInt(limitRaw ?? '8', 10);
  return {
    offset: Number.isFinite(offset) ? Math.max(offset, 0) : 0,
    limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 16) : 8,
  };
}
