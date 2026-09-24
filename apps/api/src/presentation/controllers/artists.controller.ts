import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { User } from '../../domain/user/user.entity';
import { SearchArtistsUseCase } from '../../application/use-cases/search-artists.use-case';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import {
  MAX_ARTISTS,
  SearchQuerySchema,
  type SearchQuery,
} from '@blendify/contracts';
import { RateLimit } from '../request-limits/rate-limit.guard';

const ResolveArtistsSchema = z.object({
  names: z.array(z.string().trim().min(1)).max(MAX_ARTISTS),
});

@ApiTags('artists')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/artists')
export class ArtistsController {
  constructor(private readonly search: SearchArtistsUseCase) {}

  @Get('search')
  @RateLimit('search')
  @ApiOperation({ summary: 'Search artists on Spotify' })
  async searchArtists(
    @CurrentUser() _user: User,
    @Query(new ZodValidationPipe(SearchQuerySchema)) query: SearchQuery,
  ): Promise<{ artists: unknown[] }> {
    const artists = await this.search.execute({
      query: query.q,
      limit: query.limit,
    });
    return { artists };
  }

  @Get('similar')
  @RateLimit('similar')
  @ApiOperation({
    summary:
      'Suggest similar artists from Last.fm only (no Spotify). Spotify IDs are resolved when creating the playlist.',
  })
  async similar(
    @CurrentUser() _user: User,
    @Query('name') name?: string,
    @Query('exclude') excludeRaw?: string,
    @Query('offset') offsetRaw?: string,
    @Query('limit') limitRaw?: string,
  ): Promise<{
    artists: unknown[];
    hasMore: boolean;
    source: 'lastfm';
  }> {
    const excludeNames = (excludeRaw ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const offset = Number.parseInt(offsetRaw ?? '0', 10);
    const limit = Number.parseInt(limitRaw ?? '8', 10);

    return this.search.exploreSimilar({
      seedName: name ?? '',
      excludeNames,
      offset: Number.isFinite(offset) ? offset : 0,
      limit: Number.isFinite(limit) ? limit : 8,
    });
  }

  @Post('resolve')
  @RateLimit('resolve')
  @ApiOperation({ summary: 'Resolve artist names to Spotify artists' })
  async resolve(
    @CurrentUser() _user: User,
    @Body(new ZodValidationPipe(ResolveArtistsSchema))
    body: z.output<typeof ResolveArtistsSchema>,
  ): Promise<{ artists: unknown[] }> {
    const artists = await this.search.resolveNames(body.names ?? []);
    return { artists };
  }
}
