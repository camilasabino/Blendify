import { HttpStatus } from '@nestjs/common';

export const CONCURRENCY_RETRY_AFTER_SECONDS = 5;
export const CAPACITY_RETRY_AFTER_SECONDS = 10;
export const SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS = 5;

export type RequestLimitErrorCode =
  | 'RATE_LIMITED'
  | 'CONCURRENCY_LIMITED'
  | 'CAPACITY_EXCEEDED'
  | 'SERVICE_UNAVAILABLE';

export class RequestLimitError extends Error {
  constructor(
    readonly code: RequestLimitErrorCode,
    readonly statusCode: number,
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
    this.name = 'RequestLimitError';
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static rateLimited(retryAfterSeconds: number): RequestLimitError {
    return new RequestLimitError(
      'RATE_LIMITED',
      HttpStatus.TOO_MANY_REQUESTS,
      'Too many requests. Try again later.',
      retryAfterSeconds,
    );
  }

  static concurrencyLimited(): RequestLimitError {
    return new RequestLimitError(
      'CONCURRENCY_LIMITED',
      HttpStatus.TOO_MANY_REQUESTS,
      'Another playlist is still being generated. Wait for it to finish.',
      CONCURRENCY_RETRY_AFTER_SECONDS,
    );
  }

  static capacityExceeded(): RequestLimitError {
    return new RequestLimitError(
      'CAPACITY_EXCEEDED',
      HttpStatus.SERVICE_UNAVAILABLE,
      'Blendify is busy right now. Try again shortly.',
      CAPACITY_RETRY_AFTER_SECONDS,
    );
  }

  static serviceUnavailable(): RequestLimitError {
    return new RequestLimitError(
      'SERVICE_UNAVAILABLE',
      HttpStatus.SERVICE_UNAVAILABLE,
      'Service temporarily unavailable. Try again shortly.',
      SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS,
    );
  }
}
