import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { User } from '../../domain/user/user.entity';
import { SearchArtistsUseCase } from '../../application/use-cases/search-artists.use-case';

class ResolveArtistsBody {
  @IsArray()
  @IsString({ each: true })
  names!: string[];
}

@ApiTags('artists')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/artists')
export class ArtistsController {
  constructor(private readonly search: SearchArtistsUseCase) {}

  @Get('search')
  @ApiOperation({ summary: 'Search artists on Spotify' })
  async searchArtists(
    @CurrentUser() user: User,
    @Query('q') q: string,
  ): Promise<{ artists: unknown[] }> {
    const artists = await this.search.execute(user.id, {
      query: q ?? '',
      limit: 10,
    });
    return { artists };
  }

  @Get('similar')
  @ApiOperation({
    summary:
      'Suggest popular artists in the same genre(s); supports offset for “suggest more”',
  })
  async similar(
    @CurrentUser() user: User,
    @Query('ids') ids?: string,
    @Query('offset') offsetRaw?: string,
    @Query('limit') limitRaw?: string,
  ): Promise<{ artists: unknown[]; hasMore: boolean }> {
    const artistIds = (ids ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const offset = Number.parseInt(offsetRaw ?? '0', 10);
    const limit = Number.parseInt(limitRaw ?? '8', 10);

    return this.search.exploreSimilar(user.id, artistIds, {
      excludeIds: artistIds,
      offset: Number.isFinite(offset) ? offset : 0,
      limit: Number.isFinite(limit) ? limit : 8,
    });
  }

  @Post('resolve')
  @ApiOperation({ summary: 'Resolve artist names to Spotify artists' })
  async resolve(
    @CurrentUser() user: User,
    @Body() body: ResolveArtistsBody,
  ): Promise<{ artists: unknown[] }> {
    const artists = await this.search.resolveNames(user.id, body.names ?? []);
    return { artists };
  }
}
