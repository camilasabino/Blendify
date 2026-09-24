import { ExceptionFilter, Catch, ArgumentsHost, Logger } from '@nestjs/common';
import { Response } from 'express';
import {
  retryAfterHeaderValue,
  toApiErrorResponse,
} from '../http/api-error-response';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const body = toApiErrorResponse(exception);

    if (body.code === 'INTERNAL_ERROR' && body.statusCode >= 500) {
      this.logger.error(
        'Unhandled error',
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const retryAfter = retryAfterHeaderValue(body);
    if (retryAfter) response.setHeader('Retry-After', retryAfter);
    response.status(body.statusCode).json(body);
  }
}
