import { HttpStatus } from '@nestjs/common';
import type { ApiErrorResponse } from '@blendify/contracts';
import { ZodError } from 'zod';
import { DomainError } from '../../domain/errors/domain.error';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import { CatalogUnavailableError } from '../../domain/errors/catalog-unavailable.error';
import { RequestLimitError } from './request-limit.error';

export function toApiErrorResponse(exception: unknown): ApiErrorResponse {
  if (exception instanceof ZodError) {
    return {
      statusCode: HttpStatus.BAD_REQUEST,
      code: 'VALIDATION_ERROR',
      message: exception.issues.map((i) => i.message).join('; '),
      details: { issues: exception.issues },
    };
  }

  if (exception instanceof RequestLimitError) {
    return {
      statusCode: exception.statusCode,
      code: exception.code,
      message: exception.message,
      details: { retryAfterSeconds: exception.retryAfterSeconds },
    };
  }

  if (exception instanceof CatalogUnavailableError) {
    return {
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      code: exception.code,
      message: exception.message,
    };
  }

  if (exception instanceof BusinessRuleError) {
    const status =
      exception.code === 'SPOTIFY_RATE_LIMITED' ||
      exception.code === 'SPOTIFY_QUOTA_EXCEEDED'
        ? HttpStatus.TOO_MANY_REQUESTS
        : HttpStatus.UNPROCESSABLE_ENTITY;
    return {
      statusCode: status,
      code: exception.code,
      message: exception.message,
      ...(exception.details ? { details: exception.details } : {}),
    };
  }

  if (exception instanceof DomainError) {
    return {
      statusCode: HttpStatus.BAD_REQUEST,
      code: exception.code,
      message: exception.message,
      ...(exception.details ? { details: exception.details } : {}),
    };
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
    return {
      statusCode: status,
      code: httpCode(status),
      message: Array.isArray(message) ? message.join('; ') : message,
    };
  }

  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
  };
}

function httpCode(status: number): string {
  switch (status) {
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR';
  }
}

export function retryAfterHeaderValue(body: ApiErrorResponse): string | null {
  const seconds = body.details?.retryAfterSeconds;
  if (
    typeof seconds !== 'number' ||
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
    return null;
  }
  return String(Math.ceil(seconds));
}
