import { ExceptionFilter, Catch, ArgumentsHost, Logger } from '@nestjs/common';
import { Response } from 'express';
import { currentRequestId } from '@/application/services/request-correlation';
import {
  retryAfterHeaderValue,
  toApiErrorResponse,
} from '@/presentation/http/api-error-response';

const UNKNOWN_ERROR_NAME = 'UnknownError';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const body = toApiErrorResponse(exception);

    if (body.code === 'INTERNAL_ERROR' && body.statusCode >= 500) {
      this.logger.error(
        JSON.stringify({
          event: 'unhandled_error',
          requestId: currentRequestId(),
          errorName:
            exception instanceof Error ? exception.name : UNKNOWN_ERROR_NAME,
        }),
        stackFrames(exception),
      );
    }

    const retryAfter = retryAfterHeaderValue(body);
    if (retryAfter) {
      response.setHeader('Retry-After', retryAfter);
    }
    response.status(body.statusCode).json(body);
  }
}

// Error messages can embed request or provider content (e.g. ORM argument dumps); keep only the frames.
export function stackFrames(exception: unknown): string | undefined {
  if (!(exception instanceof Error) || !exception.stack) {
    return undefined;
  }
  return exception.stack
    .split('\n')
    .filter((line) => line.trimStart().startsWith('at '))
    .join('\n');
}
