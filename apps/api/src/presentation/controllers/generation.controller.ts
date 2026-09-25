import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  GenerateDiscoverRequestSchema,
  GenerateMixRequestSchema,
  type GeneratedPlaylistDto,
} from '@blendify/contracts';
import type { Request, Response } from 'express';
import { OptionalJwtAuthGuard } from '../../infrastructure/auth/optional-jwt-auth.guard';
import {
  GeneratePlaylistUseCase,
  type PlaylistGenerationRequest,
} from '../../application/use-cases/generate-playlist.use-case';
import { toGeneratedPlaylistResponse } from '../../application/dto/playlist-response.dto';
import type { ProgressReporter } from '../../application/services/generation-progress.tracker';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import {
  acceptsNdjson,
  writeNdjsonGeneration,
} from '../http/ndjson-generation';
import { RateLimit } from '../request-limits/rate-limit.guard';
import { LimitGenerationConcurrency } from '../request-limits/generation-concurrency.interceptor';

@ApiTags('generate')
@UseGuards(OptionalJwtAuthGuard)
@Controller('api/generate')
export class GenerationController {
  constructor(private readonly generator: GeneratePlaylistUseCase) {}

  @Post('mix')
  @RateLimit('generation')
  @LimitGenerationConcurrency()
  @ApiOperation({ summary: 'Generate a mix without publishing it' })
  generateMix(
    @Body(new ZodValidationPipe(GenerateMixRequestSchema))
    body: PlaylistGenerationRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(body, req, res);
  }

  @Post('discover')
  @RateLimit('generation')
  @LimitGenerationConcurrency()
  @ApiOperation({
    summary: 'Generate a discovery playlist without publishing it',
  })
  generateDiscover(
    @Body(new ZodValidationPipe(GenerateDiscoverRequestSchema))
    body: PlaylistGenerationRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(body, req, res);
  }

  private async respond(
    request: PlaylistGenerationRequest,
    req: Request,
    res: Response,
  ): Promise<GeneratedPlaylistDto | void> {
    if (!acceptsNdjson(req)) {
      return this.generate(request);
    }
    await writeNdjsonGeneration(res, (onProgress) =>
      this.generate(request, onProgress),
    );
  }

  private async generate(
    request: PlaylistGenerationRequest,
    onProgress?: ProgressReporter,
  ): Promise<GeneratedPlaylistDto> {
    const generated = await this.generator.execute(
      request,
      onProgress ? { onProgress } : undefined,
    );
    return toGeneratedPlaylistResponse(generated);
  }
}
