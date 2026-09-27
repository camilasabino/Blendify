import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AnswerAiClarificationRequestSchema,
  CreateAiSessionRequestSchema,
  type AiSessionDto,
  type AnswerAiClarificationRequest,
  type CreateAiSessionRequest,
} from '@blendify/contracts';
import type { Request } from 'express';
import { OptionalJwtAuthGuard } from '@/infrastructure/auth/optional-jwt-auth.guard';
import { toAiSessionResponse } from '@/application/dto/ai-session-response.dto';
import { AnswerAiClarificationUseCase } from '@/application/use-cases/answer-ai-clarification.use-case';
import { CreateAiSessionUseCase } from '@/application/use-cases/create-ai-session.use-case';
import { AiSessionError } from '@/domain/errors/ai-session.error';
import { ZodValidationPipe } from '@/presentation/pipes/zod-validation.pipe';
import { RateLimit } from '@/presentation/request-limits/rate-limit.guard';

const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

@ApiTags('ai')
@UseGuards(OptionalJwtAuthGuard)
@Controller('api/ai/sessions')
export class AiSessionsController {
  constructor(
    private readonly createSession: CreateAiSessionUseCase,
    private readonly answerClarification: AnswerAiClarificationUseCase,
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
}

function currentUserId(req: Request): string | null {
  const user: { id?: unknown } | undefined = req.user;
  return typeof user?.id === 'string' && user.id.length > 0 ? user.id : null;
}
