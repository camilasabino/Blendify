import { HttpStatus } from '@nestjs/common';
import type {
  ApiErrorResponse,
  SpotifyFailureDetails,
} from '@blendify/contracts';
import { ZodError } from 'zod';
import { DomainError } from '@/domain/errors/domain.error';
import {
  AiInterpretationError,
  type AiInterpretationErrorCode,
} from '@/domain/errors/ai-interpretation.error';
import { AiGenerationError } from '@/domain/errors/ai-generation.error';
import {
  AiSessionError,
  type AiSessionErrorCode,
} from '@/domain/errors/ai-session.error';
import { BusinessRuleError } from '@/domain/errors/business-rule.error';
import { CatalogUnavailableError } from '@/domain/errors/catalog-unavailable.error';
import { PlaylistPublishIncompleteError } from '@/domain/errors/playlist-publish-incomplete.error';
import { ProviderOutcomeUnknownError } from '@/domain/errors/provider-outcome-unknown.error';
import {
  SpotifyProviderError,
  type SpotifyProviderErrorCode,
} from '@/domain/errors/spotify-provider.error';
import { SpotifyReauthRequiredError } from '@/domain/errors/spotify-reauth-required.error';
import {
  TransferError,
  type TransferErrorCode,
} from '@/domain/errors/transfer.error';
import { RequestLimitError } from './request-limit.error';

const TRANSFER_ERROR_STATUS: Record<TransferErrorCode, number> = {
  TRANSFER_TOKEN_INVALID: HttpStatus.BAD_REQUEST,
  TRANSFER_TOKEN_EXPIRED: HttpStatus.GONE,
  TRANSFER_PLAYLIST_REJECTED: HttpStatus.UNPROCESSABLE_ENTITY,
  TRANSFER_PROVIDER_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
};

const SPOTIFY_PROVIDER_ERROR_STATUS: Record<SpotifyProviderErrorCode, number> =
  {
    SPOTIFY_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
    SPOTIFY_PERMISSION_DENIED: HttpStatus.FORBIDDEN,
    SPOTIFY_REQUEST_REJECTED: HttpStatus.BAD_GATEWAY,
  };

const AI_INTERPRETATION_ERROR_STATUS: Record<
  AiInterpretationErrorCode,
  number
> = {
  AI_REQUEST_REJECTED: HttpStatus.BAD_REQUEST,
  AI_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  AI_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  AI_TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  AI_INVALID_OUTPUT: HttpStatus.BAD_GATEWAY,
};

const AI_SESSION_ERROR_STATUS: Record<AiSessionErrorCode, number> = {
  AI_SESSION_NOT_FOUND: HttpStatus.NOT_FOUND,
  AI_CLARIFICATION_OPTION_UNAVAILABLE: HttpStatus.CONFLICT,
  AI_SESSION_NOT_READY: HttpStatus.CONFLICT,
  AI_GENERATION_IN_PROGRESS: HttpStatus.CONFLICT,
  AI_GENERATION_SUPERSEDED: HttpStatus.CONFLICT,
  AI_PLAYLIST_NOT_GENERATED: HttpStatus.CONFLICT,
  AI_DESTINATION_IN_PROGRESS: HttpStatus.CONFLICT,
  AI_DESTINATION_UNAVAILABLE: HttpStatus.CONFLICT,
  AI_REFINEMENT_UNAVAILABLE: HttpStatus.CONFLICT,
  AI_REFINEMENT_IN_PROGRESS: HttpStatus.CONFLICT,
  AI_REFINEMENT_LIMIT_REACHED: HttpStatus.CONFLICT,
  AI_REFINEMENT_SUPERSEDED: HttpStatus.CONFLICT,
  AI_REFINEMENT_PENDING: HttpStatus.CONFLICT,
  AI_REFINEMENT_STALE: HttpStatus.CONFLICT,
  AI_REFINEMENT_NOT_APPLICABLE: HttpStatus.CONFLICT,
};

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

  if (exception instanceof TransferError) {
    return {
      statusCode: TRANSFER_ERROR_STATUS[exception.code],
      code: exception.code,
      message: exception.message,
      ...(exception.retryAfterSeconds
        ? { details: { retryAfterSeconds: exception.retryAfterSeconds } }
        : {}),
    };
  }

  if (exception instanceof AiInterpretationError) {
    return {
      statusCode: AI_INTERPRETATION_ERROR_STATUS[exception.code],
      code: exception.code,
      message: exception.message,
    };
  }

  if (exception instanceof AiSessionError) {
    return {
      statusCode: AI_SESSION_ERROR_STATUS[exception.code],
      code: exception.code,
      message: exception.message,
    };
  }

  if (exception instanceof AiGenerationError) {
    return {
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      code: exception.code,
      message: exception.message,
      details: { ...exception.details },
    };
  }

  if (exception instanceof CatalogUnavailableError) {
    const providerWait = providerWaitOf(exception.cause);
    return {
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      code: exception.code,
      message: exception.message,
      ...(providerWait ? { details: providerWait } : {}),
    };
  }

  if (exception instanceof SpotifyProviderError) {
    return {
      statusCode: SPOTIFY_PROVIDER_ERROR_STATUS[exception.code],
      code: exception.code,
      message: exception.message,
      details: { ...exception.failure },
    };
  }

  if (exception instanceof ProviderOutcomeUnknownError) {
    return {
      statusCode: HttpStatus.BAD_GATEWAY,
      code: exception.code,
      message:
        'Spotify did not confirm the result of this change. Check Spotify before trying again.',
      ...(exception.failure ? { details: { ...exception.failure } } : {}),
    };
  }

  if (exception instanceof PlaylistPublishIncompleteError) {
    return {
      statusCode: HttpStatus.BAD_GATEWAY,
      code: exception.code,
      message: exception.message,
      details: { ...exception.details },
    };
  }

  if (exception instanceof SpotifyReauthRequiredError) {
    return {
      statusCode: HttpStatus.UNAUTHORIZED,
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

function providerWaitOf(
  cause: unknown,
): Pick<
  SpotifyFailureDetails,
  'retryAfterSeconds' | 'retryAfterSource'
> | null {
  if (
    !(cause instanceof SpotifyProviderError) ||
    cause.failure.retryAfterSeconds === undefined
  ) {
    return null;
  }
  return {
    retryAfterSeconds: cause.failure.retryAfterSeconds,
    retryAfterSource: cause.failure.retryAfterSource,
  };
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
