import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OptionalJwtAuthGuard } from '../../infrastructure/auth/optional-jwt-auth.guard';
import { SearchTracksUseCase } from '../../application/use-cases/search-tracks.use-case';
import { SearchQuerySchema, type SearchQuery } from '@blendify/contracts';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { RateLimit } from '../request-limits/rate-limit.guard';

@ApiTags('tracks')
@UseGuards(OptionalJwtAuthGuard)
@Controller('api/tracks')
export class TracksController {
  constructor(private readonly search: SearchTracksUseCase) {}

  @Get('search')
  @RateLimit('search')
  @ApiOperation({ summary: 'Search tracks on Spotify' })
  async searchTracks(
    @Query(new ZodValidationPipe(SearchQuerySchema)) query: SearchQuery,
  ): Promise<{ tracks: unknown[] }> {
    const tracks = await this.search.execute(query.q, query.limit);
    return { tracks };
  }
}
