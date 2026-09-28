import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AnswerAiClarificationRequestSchema,
  CreateAiSessionRequestSchema,
  PublishAiPlaylistRequestSchema,
  TransferAiPlaylistRequestSchema,
  type AiGenerationDto,
  type AiSessionDto,
  type AiSessionStateDto,
  type AnswerAiClarificationRequest,
  type CreateAiSessionRequest,
  type TransferAiPlaylistRequest,
} from '@blendify/contracts';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { JwtAuthGuard } from '@/infrastructure/auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '@/infrastructure/auth/optional-jwt-auth.guard';
import {
  toAiGenerationResponse,
  toAiSessionStateResponse,
} from '@/application/dto/ai-generation-response.dto';
import { toAiSessionResponse } from '@/application/dto/ai-session-response.dto';
import type { ProgressReporter } from '@/application/services/generation-progress.tracker';
import { AnswerAiClarificationUseCase } from '@/application/use-cases/answer-ai-clarification.use-case';
import { CreateAiSessionUseCase } from '@/application/use-cases/create-ai-session.use-case';
import { GenerateAiPlaylistUseCase } from '@/application/use-cases/generate-ai-playlist.use-case';
import { GetAiSessionUseCase } from '@/application/use-cases/get-ai-session.use-case';
import { PublishAiPlaylistUseCase } from '@/application/use-cases/publish-ai-playlist.use-case';
import { TransferAiPlaylistUseCase } from '@/application/use-cases/transfer-ai-playlist.use-case';
import { AiSessionError } from '@/domain/errors/ai-session.error';
import type { User } from '@/domain/user/user.entity';
import { CurrentUser } from '@/presentation/decorators/current-user.decorator';
import { GuestTransferGate } from '@/presentation/guards/guest-transfer.gate';
import {
  acceptsNdjson,
  writeNdjsonGeneration,
} from '@/presentation/http/ndjson-generation';
import { ZodValidationPipe } from '@/presentation/pipes/zod-validation.pipe';
import { LimitGenerationConcurrency } from '@/presentation/request-limits/generation-concurrency.interceptor';
import { RateLimit } from '@/presentation/request-limits/rate-limit.guard';

const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

type PublishAiPlaylistBody = z.output<typeof PublishAiPlaylistRequestSchema>;

@ApiTags('ai')
@UseGuards(OptionalJwtAuthGuard)
@Controller('api/ai/sessions')
export class AiSessionsController {
  constructor(
    private readonly createSession: CreateAiSessionUseCase,
    private readonly answerClarification: AnswerAiClarificationUseCase,
    private readonly generatePlaylist: GenerateAiPlaylistUseCase,
    private readonly getSession: GetAiSessionUseCase,
    private readonly publishPlaylist: PublishAiPlaylistUseCase,
    private readonly transferPlaylist: TransferAiPlaylistUseCase,
    private readonly transferGate: GuestTransferGate,
  ) {}

  @Post()
  @RateLimit('interpret')
  @ApiOperation({
    summary: 'Interpret a playlist request into a Create with AI session',
  })
  async create(
    @Body(new ZodValidationPipe(CreateAiSessionRequestSchema))
    body: CreateAiSessionRequest,
    @Req() req: Request,
  ): Promise<AiSessionDto> {
    const { token, session } = await this.createSession.execute({
      prompt: body.prompt,
      userId: currentUserId(req),
    });
    return toAiSessionResponse(token, session);
  }

  @Get(':sessionId')
  @ApiOperation({
    summary: 'Read the public state of a Create with AI session',
  })
  async find(
    @Param('sessionId') sessionId: string,
    @Req() req: Request,
  ): Promise<AiSessionStateDto> {
    if (!SESSION_TOKEN_PATTERN.test(sessionId)) {
      throw AiSessionError.notFound();
    }

    const userId = currentUserId(req);
    const { token, session } = await this.getSession.execute({
      token: sessionId,
      userId,
    });
    return toAiSessionStateResponse(
      token,
      session,
      this.destinationOptions(userId),
    );
  }

  @Post(':sessionId/clarification')
  @HttpCode(HttpStatus.OK)
  @RateLimit('resolve')
  @ApiOperation({ summary: 'Apply one offered clarification option' })
  async answer(
    @Param('sessionId') sessionId: string,
    @Body(new ZodValidationPipe(AnswerAiClarificationRequestSchema))
    body: AnswerAiClarificationRequest,
    @Req() req: Request,
  ): Promise<AiSessionDto> {
    if (!SESSION_TOKEN_PATTERN.test(sessionId)) {
      throw AiSessionError.notFound();
    }

    const { token, session } = await this.answerClarification.execute({
      token: sessionId,
      optionId: body.optionId,
      userId: currentUserId(req),
    });
    return toAiSessionResponse(token, session);
  }

  @Post(':sessionId/generate')
  @HttpCode(HttpStatus.OK)
  @RateLimit('generation')
  @LimitGenerationConcurrency()
  @ApiOperation({
    summary: 'Create a playlist preview from a reviewed Create with AI session',
  })
  async generate(
    @Param('sessionId') sessionId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AiGenerationDto | void> {
    if (!SESSION_TOKEN_PATTERN.test(sessionId)) {
      throw AiSessionError.notFound();
    }

    const userId = currentUserId(req);
    const run = async (onProgress?: ProgressReporter) => {
      const { token, session } = await this.generatePlaylist.execute({
        token: sessionId,
        userId,
        onProgress,
      });
      return toAiGenerationResponse(
        token,
        session,
        this.destinationOptions(userId),
      );
    };

    if (!acceptsNdjson(req)) {
      return run();
    }
    await writeNdjsonGeneration(res, run);
  }

  @Post(':sessionId/publish')
  @HttpCode(HttpStatus.OK)
  @RateLimit('generation')
  @LimitGenerationConcurrency()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Save the generated Create with AI playlist to Spotify',
  })
  async publish(
    @Param('sessionId') sessionId: string,
    @Body(new ZodValidationPipe(PublishAiPlaylistRequestSchema))
    body: PublishAiPlaylistBody,
    @CurrentUser() user: User,
  ): Promise<AiSessionStateDto> {
    if (!SESSION_TOKEN_PATTERN.test(sessionId)) {
      throw AiSessionError.notFound();
    }

    const { token, session } = await this.publishPlaylist.execute({
      token: sessionId,
      userId: user.id,
      name: body.name,
      coverImageBase64: body.coverImageBase64,
      persistToLibrary: body.persistToLibrary,
    });
    return toAiSessionStateResponse(
      token,
      session,
      this.destinationOptions(user.id),
    );
  }

  @Post(':sessionId/transfer')
  @HttpCode(HttpStatus.OK)
  @RateLimit('transfer')
  @UseGuards(GuestTransferGate)
  @ApiOperation({
    summary:
      'Prepare a Soundiiz transfer for the generated Create with AI playlist',
  })
  async transfer(
    @Param('sessionId') sessionId: string,
    @Body(new ZodValidationPipe(TransferAiPlaylistRequestSchema))
    body: TransferAiPlaylistRequest,
    @Req() req: Request,
  ): Promise<AiSessionStateDto> {
    if (!SESSION_TOKEN_PATTERN.test(sessionId)) {
      throw AiSessionError.notFound();
    }

    const userId = currentUserId(req);
    const { token, session } = await this.transferPlaylist.execute({
      token: sessionId,
      userId,
      name: body.name,
    });
    return toAiSessionStateResponse(
      token,
      session,
      this.destinationOptions(userId),
    );
  }

  private destinationOptions(userId: string | null) {
    return { transferEnabled: this.transferGate.enabled && userId === null };
  }
}

function currentUserId(req: Request): string | null {
  const user: { id?: unknown } | undefined = req.user;
  return typeof user?.id === 'string' && user.id.length > 0 ? user.id : null;
}
