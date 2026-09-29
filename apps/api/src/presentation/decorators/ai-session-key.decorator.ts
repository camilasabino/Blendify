import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import {
  AI_SESSION_KEY_HEADER,
  AI_SESSION_KEY_PATTERN,
  aiSessionId,
} from '@/application/services/ai-session-credential';
import { AiSessionError } from '@/domain/errors/ai-session.error';

export const AiSessionKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const header = request.headers[AI_SESSION_KEY_HEADER.toLowerCase()];

    if (
      typeof header !== 'string' ||
      !AI_SESSION_KEY_PATTERN.test(header) ||
      aiSessionId(header) !== request.params.sessionId
    ) {
      throw AiSessionError.notFound();
    }
    return header;
  },
);
