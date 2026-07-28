import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { DomainError } from '../../domain/errors/domain.error';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import { ZodError } from 'zod';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof ZodError) {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        code: 'VALIDATION_ERROR',
        message: exception.issues.map((i) => i.message).join('; '),
      });
      return;
    }

    if (exception instanceof BusinessRuleError) {
      const status =
        exception.code === 'SPOTIFY_RATE_LIMITED' ||
        exception.code === 'SPOTIFY_QUOTA_EXCEEDED'
          ? HttpStatus.TOO_MANY_REQUESTS
          : HttpStatus.UNPROCESSABLE_ENTITY;
      response.status(status).json({
        statusCode: status,
        code: exception.code,
        message: exception.message,
        ...(exception.details ? { details: exception.details } : {}),
      });
      return;
    }

    if (exception instanceof DomainError) {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        code: exception.code,
        message: exception.message,
        ...(exception.details ? { details: exception.details } : {}),
      });
      return;
    }

    const httpException = exception as {
      getStatus?: () => number;
      message?: string;
      response?: { message?: string | string[] };
    };

    if (typeof httpException.getStatus === 'function') {
      const status = httpException.getStatus();
      const message =
        httpException.response?.message ?? httpException.message ?? 'Error';
      response.status(status).json({
        statusCode: status,
        message,
      });
      return;
    }

    this.logger.error(
      'Unhandled error',
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
}
