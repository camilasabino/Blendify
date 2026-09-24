import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { User } from '../../domain/user/user.entity';
import { SearchTracksUseCase } from '../../application/use-cases/search-tracks.use-case';
import { SearchQuerySchema, type SearchQuery } from '@blendify/contracts';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { RateLimit } from '../request-limits/rate-limit.guard';

@ApiTags('tracks')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/tracks')
export class TracksController {
  constructor(private readonly search: SearchTracksUseCase) {}

  @Get('search')
  @RateLimit('search')
  @ApiOperation({ summary: 'Search tracks on Spotify' })
  async searchTracks(
    @CurrentUser() _user: User,
    @Query(new ZodValidationPipe(SearchQuerySchema)) query: SearchQuery,
  ): Promise<{ tracks: unknown[] }> {
    const tracks = await this.search.execute(query.q, query.limit);
    return { tracks };
  }
}
