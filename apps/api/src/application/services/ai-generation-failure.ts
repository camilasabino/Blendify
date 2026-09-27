import { MAX_ARTISTS } from '@blendify/contracts';
import type { AiGenerationFailure } from '@/domain/ai/ai-session';
import { AiGenerationError } from '@/domain/errors/ai-generation.error';
import { BusinessRuleError } from '@/domain/errors/business-rule.error';
import { CatalogUnavailableError } from '@/domain/errors/catalog-unavailable.error';
import { isSpotifyQuotaError } from '@/domain/genre/catalog-resolve';

const INSUFFICIENT_RESULT_CODES = new Set([
  'NO_TRACKS_FOUND',
  'DISCOVER_NOT_ENOUGH_SIMILAR',
  'DISCOVER_RESOLVE_FAILED',
]);
const PROVIDER_UNAVAILABLE_CODES = new Set([
  'LASTFM_NOT_CONFIGURED',
  'LASTFM_SIMILAR_FAILED',
  'GENRE_LOOKUP_UNAVAILABLE',
]);

export function describeAiGenerationFailure(
  error: unknown,
): AiGenerationFailure {
  if (error instanceof AiGenerationError) {
    return {
      ...failure(error.code, 'seed_not_found'),
      seedNotFound: {
        seedType: error.details.seedType,
        names: error.details.names.slice(0, MAX_ARTISTS),
      },
    };
  }
  if (error instanceof CatalogUnavailableError) {
    return failure(error.code, 'provider_unavailable');
  }
  if (error instanceof BusinessRuleError) {
    if (isSpotifyQuotaError(error)) {
      return failure(
        error.code,
        'provider_rate_limited',
        retryAfterSeconds(error.details),
      );
    }
    if (INSUFFICIENT_RESULT_CODES.has(error.code)) {
      return failure(error.code, 'insufficient_results');
    }
    if (PROVIDER_UNAVAILABLE_CODES.has(error.code)) {
      return failure(error.code, 'provider_unavailable');
    }
    return failure(error.code, 'failed');
  }
  return failure('INTERNAL_ERROR', 'failed');
}

function failure(
  code: string,
  category: AiGenerationFailure['category'],
  retryAfter: number | null = null,
): AiGenerationFailure {
  return { code, category, retryAfterSeconds: retryAfter, seedNotFound: null };
}

function retryAfterSeconds(
  details: Record<string, unknown> | undefined,
): number | null {
  const value = details?.retryAfterSeconds;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
