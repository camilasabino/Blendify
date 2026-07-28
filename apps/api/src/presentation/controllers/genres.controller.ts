import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { GenerateGenrePlaylistUseCase } from '../../application/use-cases/generate-genre-playlist.use-case';
import { MixMode } from '../../domain/genre/mix-mode';
import { toGenreDto } from '../../domain/genre/curated-genres';

function parsePage(offsetRaw?: string, limitRaw?: string) {
  const offset = Number.parseInt(offsetRaw ?? '0', 10);
  const limit = Number.parseInt(limitRaw ?? '8', 10);
  return {
    offset: Number.isFinite(offset) ? Math.max(offset, 0) : 0,
    limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 16) : 8,
  };
}

@ApiTags('genres')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/genres')
export class GenresController {
  constructor(private readonly genres: GenerateGenrePlaylistUseCase) {}

  @Get()
  @ApiOperation({ summary: 'List curated genres and mix modes' })
  list() {
    return {
      genres: this.genres.listMain().map(toGenreDto),
      all: this.genres.listCurated().map(toGenreDto),
      mixModes: [
        { id: MixMode.POPULAR, label: 'Popular' },
        { id: MixMode.BALANCED, label: 'Balanced' },
        { id: MixMode.RARITIES, label: 'Rarities' },
        { id: MixMode.MOOD_ENERGETIC, label: 'Energetic' },
        { id: MixMode.MOOD_CHILL, label: 'Chill' },
        { id: MixMode.MOOD_MELANCHOLIC, label: 'Melancholic' },
      ],
    };
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search curated genres and surface related explore suggestions',
  })
  search(
    @Query('q') q: string,
    @Query('offset') offsetRaw?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const query = q ?? '';
    parsePage(offsetRaw, limitRaw);
    const genres = this.genres.search(query).map(toGenreDto);

    return {
      genres,
    };
  }

  @Get('explore')
  @ApiOperation({
    summary:
      'Suggest related/subgenres for selected ids; uses the last id as seed (one at a time)',
  })
  explore(
    @Query('ids') ids?: string,
    @Query('offset') offsetRaw?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const selectedIds = (ids ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const page = parsePage(offsetRaw, limitRaw);
    const result = this.genres.explore(selectedIds, page);

    return {
      genres: result.genres.map(toGenreDto),
      hasMore: result.hasMore,
    };
  }
}
