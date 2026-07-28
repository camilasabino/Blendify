import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { User } from '../../domain/user/user.entity';
import { GeneratePlaylistUseCase } from '../../application/use-cases/generate-playlist.use-case';
import { GenerateGenrePlaylistUseCase } from '../../application/use-cases/generate-genre-playlist.use-case';
import { GetPlaylistHistoryUseCase } from '../../application/use-cases/get-playlist-history.use-case';
import { RenamePlaylistUseCase } from '../../application/use-cases/rename-playlist.use-case';
import { DeletePlaylistHistoryUseCase } from '../../application/use-cases/delete-playlist-history.use-case';
import { BulkPlaylistHistoryUseCase } from '../../application/use-cases/bulk-playlist-history.use-case';
import { RegeneratePlaylistUseCase } from '../../application/use-cases/regenerate-playlist.use-case';
import {
  MAX_ARTISTS,
  MAX_GENRES,
  MAX_SONGS_PER_ARTIST,
  MAX_SONGS_PER_GENRE,
} from '../../domain/constants';
import { MIX_MODES } from '../../domain/genre/mix-mode';

class ArtistSnapshotBody {
  @IsString()
  @MinLength(1)
  id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string | null;
}

class CreatePlaylistBody {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsIn(['artists', 'genres'])
  source?: 'artists' | 'genres';

  @ValidateIf((o: CreatePlaylistBody) => (o.source ?? 'artists') === 'artists')
  @IsArray()
  @IsString({ each: true })
  artistIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ArtistSnapshotBody)
  artists?: ArtistSnapshotBody[];

  @ValidateIf((o: CreatePlaylistBody) => (o.source ?? 'artists') === 'artists')
  @IsInt()
  @Min(1)
  @Max(MAX_SONGS_PER_ARTIST)
  songsPerArtist?: number;

  @ValidateIf((o: CreatePlaylistBody) => o.source === 'genres')
  @IsArray()
  @IsString({ each: true })
  genreIds?: string[];

  @IsOptional()
  @IsIn([...MIX_MODES])
  mixMode?: string;

  @ValidateIf((o: CreatePlaylistBody) => o.source === 'genres')
  @IsInt()
  @Min(1)
  @Max(MAX_SONGS_PER_GENRE)
  songsPerGenre?: number;

  @IsOptional()
  @IsBoolean()
  shuffle?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(400_000)
  coverImageBase64?: string;
}

class RenameBody {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}

class BulkHistoryBody {
  @IsIn(['purge_active', 'clear_deleted'])
  action!: 'purge_active' | 'clear_deleted';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

@ApiTags('playlists')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/playlists')
export class PlaylistsController {
  constructor(
    private readonly generate: GeneratePlaylistUseCase,
    private readonly generateGenre: GenerateGenrePlaylistUseCase,
    private readonly history: GetPlaylistHistoryUseCase,
    private readonly rename: RenamePlaylistUseCase,
    private readonly remove: DeletePlaylistHistoryUseCase,
    private readonly bulk: BulkPlaylistHistoryUseCase,
    private readonly regenerate: RegeneratePlaylistUseCase,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Generate a Spotify playlist from artists or genres',
  })
  create(@CurrentUser() user: User, @Body() body: CreatePlaylistBody) {
    const source = body.source ?? 'artists';

    if (source === 'genres') {
      const genreIds = body.genreIds ?? [];
      if (genreIds.length === 0) {
        throw new BadRequestException('genreIds is required');
      }
      if (genreIds.length > MAX_GENRES) {
        throw new BadRequestException(`Maximum ${MAX_GENRES} genres allowed`);
      }
      if (!body.mixMode) {
        throw new BadRequestException('mixMode is required');
      }
      return this.generateGenre.execute({
        userId: user.id,
        name: body.name ?? '',
        description: body.description ?? '',
        genreIds,
        mixMode: body.mixMode as (typeof MIX_MODES)[number],
        songsPerGenre: body.songsPerGenre ?? 10,
        shuffle: body.shuffle ?? true,
        isPublic: false,
        coverImageBase64: body.coverImageBase64,
      });
    }

    const artistIds = body.artistIds ?? [];
    if (artistIds.length === 0) {
      throw new BadRequestException('artistIds is required');
    }
    if (artistIds.length > MAX_ARTISTS) {
      throw new BadRequestException(`Maximum ${MAX_ARTISTS} artists allowed`);
    }
    return this.generate.execute({
      userId: user.id,
      name: body.name ?? '',
      description: body.description ?? '',
      artistIds,
      artists: body.artists,
      songsPerArtist: body.songsPerArtist ?? 10,
      mixMode: (body.mixMode as (typeof MIX_MODES)[number]) ?? 'balanced',
      shuffle: body.shuffle ?? true,
      isPublic: false,
      coverImageBase64: body.coverImageBase64,
    });
  }

  @Get()
  @ApiOperation({
    summary:
      'List playlist history (paginated, newest first; optional Spotify sync + name search)',
  })
  async list(
    @CurrentUser() user: User,
    @Query('sync') sync?: string,
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
    @Query('q') q?: string,
  ) {
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    const offset = offsetRaw ? Number.parseInt(offsetRaw, 10) : undefined;
    return this.history.execute(user.id, {
      sync: sync === '1' || sync === 'true',
      limit: Number.isFinite(limit) ? limit : undefined,
      offset: Number.isFinite(offset) ? offset : undefined,
      q,
    });
  }

  @Post('bulk')
  @ApiOperation({
    summary:
      'Bulk history actions: purge all active on Spotify, or clear deleted from history',
  })
  bulkHistory(@CurrentUser() user: User, @Body() body: BulkHistoryBody) {
    return this.bulk.execute(user.id, body.action, { q: body.q });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename playlist (local + Spotify when linked)' })
  renamePlaylist(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: RenameBody,
  ) {
    return this.rename.execute(user.id, id, body.name);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete from history; optionally unfollow/delete on Spotify too',
  })
  async delete(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('fromSpotify') fromSpotify?: string,
  ) {
    await this.remove.execute(user.id, id, {
      fromSpotify: fromSpotify === '1' || fromSpotify === 'true',
    });
    return { ok: true };
  }

  @Post(':id/regenerate')
  @ApiOperation({
    summary: 'Regenerate / recreate playlist with same parameters',
  })
  regeneratePlaylist(@CurrentUser() user: User, @Param('id') id: string) {
    return this.regenerate.execute(user.id, id);
  }
}
