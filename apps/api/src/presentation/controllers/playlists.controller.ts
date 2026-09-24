import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  BulkLibraryRequestSchema,
  CreateDiscoverRequestSchema,
  CreateMixRequestSchema,
  DeletePlaylistQuerySchema,
  PlaylistLibraryQuerySchema,
  RenamePlaylistRequestSchema,
  type DeletePlaylistQuery,
  type PlaylistLibraryQuery,
} from '@blendify/contracts';
import type { z } from 'zod';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt-auth.guard';
import {
  CreateSpotifyPlaylistUseCase,
  type SpotifyPlaylistRequest,
} from '../../application/use-cases/create-spotify-playlist.use-case';
import { ListLibraryPlaylistsUseCase } from '../../application/use-cases/list-library-playlists.use-case';
import { GetPlaylistDetailUseCase } from '../../application/use-cases/get-playlist-detail.use-case';
import { RenamePlaylistUseCase } from '../../application/use-cases/rename-playlist.use-case';
import { RemovePlaylistFromLibraryUseCase } from '../../application/use-cases/remove-playlist-from-library.use-case';
import { BulkLibraryUseCase } from '../../application/use-cases/bulk-library.use-case';
import { CurrentUser } from '../decorators/current-user.decorator';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { User } from '../../domain/user/user.entity';
import {
  acceptsNdjson,
  writeNdjsonGeneration,
} from '../http/ndjson-generation';
import type { ProgressReporter } from '../../application/services/generation-progress.tracker';

type MixRequest = z.output<typeof CreateMixRequestSchema>;
type DiscoverRequest = z.output<typeof CreateDiscoverRequestSchema>;
type RenameRequest = z.output<typeof RenamePlaylistRequestSchema>;
type BulkRequest = z.output<typeof BulkLibraryRequestSchema>;

@ApiTags('playlists')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/playlists')
export class PlaylistsController {
  constructor(
    private readonly createPlaylist: CreateSpotifyPlaylistUseCase,
    private readonly library: ListLibraryPlaylistsUseCase,
    private readonly detail: GetPlaylistDetailUseCase,
    private readonly rename: RenamePlaylistUseCase,
    private readonly remove: RemovePlaylistFromLibraryUseCase,
    private readonly bulk: BulkLibraryUseCase,
  ) {}

  @Post('mix')
  @ApiOperation({ summary: 'Generate a Spotify playlist mix' })
  async createMix(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(CreateMixRequestSchema)) body: MixRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!acceptsNdjson(req)) {
      return this.create(user.id, body);
    }
    await writeNdjsonGeneration(res, (onProgress) =>
      this.create(user.id, body, onProgress),
    );
  }

  @Post('discover')
  @ApiOperation({ summary: 'Generate a Spotify discovery playlist' })
  async createDiscover(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(CreateDiscoverRequestSchema))
    body: DiscoverRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!acceptsNdjson(req)) {
      return this.create(user.id, body);
    }
    await writeNdjsonGeneration(res, (onProgress) =>
      this.create(user.id, body, onProgress),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List saved Blendify playlists' })
  list(
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(PlaylistLibraryQuerySchema))
    query: PlaylistLibraryQuery,
  ) {
    return this.library.execute(user.id, {
      sync: query.sync,
      limit: query.limit,
      offset: query.offset,
      q: query.q,
    });
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Run a bulk action on saved playlists' })
  bulkLibrary(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(BulkLibraryRequestSchema)) body: BulkRequest,
  ) {
    return this.bulk.execute(user.id, body.action, {
      q: body.q,
      playlistIds: body.playlistIds,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a saved playlist with its tracks' })
  getDetail(@CurrentUser() user: User, @Param('id') id: string) {
    return this.detail.execute(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a playlist in Blendify and Spotify' })
  renamePlaylist(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RenamePlaylistRequestSchema))
    body: RenameRequest,
  ) {
    return this.rename.execute(user.id, id, body.name);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Remove a playlist from Blendify and optionally Spotify',
  })
  async deletePlaylist(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(DeletePlaylistQuerySchema))
    query: DeletePlaylistQuery,
  ) {
    await this.remove.execute(user.id, id, {
      fromSpotify: query.fromSpotify,
    });
    return { ok: true as const };
  }

  private create(
    userId: string,
    request: SpotifyPlaylistRequest,
    onProgress?: ProgressReporter,
  ) {
    return this.createPlaylist.execute(
      { userId, request },
      onProgress ? { onProgress } : undefined,
    );
  }
}
