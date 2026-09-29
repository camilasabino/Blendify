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
  AiRefinementIdSchema,
  AnswerAiClarificationRequestSchema,
  CreateAiRefinementRequestSchema,
  CreateAiSessionRequestSchema,
  PublishAiPlaylistRequestSchema,
  TransferAiPlaylistRequestSchema,
  type AiGenerationDto,
  type AiRefinementResultDto,
  type AiSessionCreatedDto,
  type AiSessionDto,
  type AiSessionStateDto,
  type AnswerAiClarificationRequest,
  type CreateAiRefinementRequest,
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
import { toAiRefinementResponse } from '@/application/dto/ai-refinement-response.dto';
import {
  toAiSessionCreatedResponse,
  toAiSessionResponse,
} from '@/application/dto/ai-session-response.dto';
import type { ProgressReporter } from '@/application/services/generation-progress.tracker';
import { AnswerAiClarificationUseCase } from '@/application/use-cases/answer-ai-clarification.use-case';
import { ApplyAiRefinementUseCase } from '@/application/use-cases/apply-ai-refinement.use-case';
import { CreateAiSessionUseCase } from '@/application/use-cases/create-ai-session.use-case';
import { DismissAiRefinementUseCase } from '@/application/use-cases/dismiss-ai-refinement.use-case';
import { GenerateAiPlaylistUseCase } from '@/application/use-cases/generate-ai-playlist.use-case';
import { GetAiSessionUseCase } from '@/application/use-cases/get-ai-session.use-case';
import { ProposeAiRefinementUseCase } from '@/application/use-cases/propose-ai-refinement.use-case';
import { PublishAiPlaylistUseCase } from '@/application/use-cases/publish-ai-playlist.use-case';
import { TransferAiPlaylistUseCase } from '@/application/use-cases/transfer-ai-playlist.use-case';
import { AiSessionError } from '@/domain/errors/ai-session.error';
import type { User } from '@/domain/user/user.entity';
import { AiSessionKey } from '@/presentation/decorators/ai-session-key.decorator';
import { CurrentUser } from '@/presentation/decorators/current-user.decorator';
import { GuestTransferGate } from '@/presentation/guards/guest-transfer.gate';
import {
  acceptsNdjson,
  writeNdjsonGeneration,
} from '@/presentation/http/ndjson-generation';
import { ZodValidationPipe } from '@/presentation/pipes/zod-validation.pipe';
import { LimitGenerationConcurrency } from '@/presentation/request-limits/generation-concurrency.interceptor';
import { RateLimit } from '@/presentation/request-limits/rate-limit.guard';

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
    private readonly proposeRefinement: ProposeAiRefinementUseCase,
    private readonly applyRefinement: ApplyAiRefinementUseCase,
    private readonly dismissRefinement: DismissAiRefinementUseCase,
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
  ): Promise<AiSessionCreatedDto> {
    const { token, session } = await this.createSession.execute({
      prompt: body.prompt,
      userId: currentUserId(req),
    });
    return toAiSessionCreatedResponse(token, session);
  }

  @Get(':sessionId')
  @ApiOperation({
    summary: 'Read the public state of a Create with AI session',
  })
  async find(
    @AiSessionKey() sessionKey: string,
    @Req() req: Request,
  ): Promise<AiSessionStateDto> {
    const userId = currentUserId(req);
    const { token, session } = await this.getSession.execute({
      token: sessionKey,
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
    @AiSessionKey() sessionKey: string,
    @Body(new ZodValidationPipe(AnswerAiClarificationRequestSchema))
    body: AnswerAiClarificationRequest,
    @Req() req: Request,
  ): Promise<AiSessionDto> {
    const { token, session } = await this.answerClarification.execute({
      token: sessionKey,
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
    @AiSessionKey() sessionKey: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AiGenerationDto | void> {
    const userId = currentUserId(req);
    const run = async (onProgress?: ProgressReporter) => {
      const { token, session } = await this.generatePlaylist.execute({
        token: sessionKey,
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
    @AiSessionKey() sessionKey: string,
    @Body(new ZodValidationPipe(PublishAiPlaylistRequestSchema))
    body: PublishAiPlaylistBody,
    @CurrentUser() user: User,
  ): Promise<AiSessionStateDto> {
    const { token, session } = await this.publishPlaylist.execute({
      token: sessionKey,
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
    @AiSessionKey() sessionKey: string,
    @Body(new ZodValidationPipe(TransferAiPlaylistRequestSchema))
    body: TransferAiPlaylistRequest,
    @Req() req: Request,
  ): Promise<AiSessionStateDto> {
    const userId = currentUserId(req);
    const { token, session } = await this.transferPlaylist.execute({
      token: sessionKey,
      userId,
      name: body.name,
    });
    return toAiSessionStateResponse(
      token,
      session,
      this.destinationOptions(userId),
    );
  }

  @Post(':sessionId/refinements')
  @HttpCode(HttpStatus.OK)
  @RateLimit('interpret')
  @LimitGenerationConcurrency()
  @ApiOperation({
    summary:
      'Interpret a refinement and build a pending candidate playlist without applying it',
  })
  async refine(
    @AiSessionKey() sessionKey: string,
    @Body(new ZodValidationPipe(CreateAiRefinementRequestSchema))
    body: CreateAiRefinementRequest,
    @Req() req: Request,
  ): Promise<AiRefinementResultDto> {
    const { token, session } = await this.proposeRefinement.execute({
      token: sessionKey,
      userId: currentUserId(req),
      refinement: body.refinement,
      preservePositions: body.preservePositions,
    });
    return toAiRefinementResponse(token, session);
  }

  @Post(':sessionId/refinements/:refinementId/apply')
  @HttpCode(HttpStatus.OK)
  @RateLimit('resolve')
  @ApiOperation({
    summary:
      'Make the reviewed pending candidate the current playlist without regenerating it',
  })
  async apply(
    @AiSessionKey() sessionKey: string,
    @Param('refinementId') refinementId: string,
    @Req() req: Request,
  ): Promise<AiSessionStateDto> {
    return this.settle(this.applyRefinement, sessionKey, refinementId, req);
  }

  @Post(':sessionId/refinements/:refinementId/dismiss')
  @HttpCode(HttpStatus.OK)
  @RateLimit('resolve')
  @ApiOperation({
    summary: 'Discard the pending refinement and keep the current playlist',
  })
  async dismiss(
    @AiSessionKey() sessionKey: string,
    @Param('refinementId') refinementId: string,
    @Req() req: Request,
  ): Promise<AiSessionStateDto> {
    return this.settle(this.dismissRefinement, sessionKey, refinementId, req);
  }

  private async settle(
    useCase: ApplyAiRefinementUseCase | DismissAiRefinementUseCase,
    sessionKey: string,
    refinementId: string,
    req: Request,
  ): Promise<AiSessionStateDto> {
    if (!AiRefinementIdSchema.safeParse(refinementId).success) {
      throw AiSessionError.refinementStale();
    }

    const userId = currentUserId(req);
    const { token, session } = await useCase.execute({
      token: sessionKey,
      userId,
      refinementId,
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
