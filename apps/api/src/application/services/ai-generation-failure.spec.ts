import { MAX_ARTISTS } from '@blendify/contracts';
import { AiGenerationError } from '@/domain/errors/ai-generation.error';
import { CatalogUnavailableError } from '@/domain/errors/catalog-unavailable.error';
import { createSpotifyQuotaError } from '@/infrastructure/spotify/spotify-quota-error';
import { describeAiGenerationFailure } from './ai-generation-failure';

describe('describeAiGenerationFailure', () => {
  it('keeps only the user-authored names of a missing seed, bounded by the seed limit', () => {
    const names = Array.from(
      { length: MAX_ARTISTS + 3 },
      (_, index) => `Artist ${index}`,
    );

    const failure = describeAiGenerationFailure(
      AiGenerationError.seedNotFound('artist', names),
    );

    expect(failure).toEqual({
      code: 'AI_SEED_NOT_FOUND',
      category: 'seed_not_found',
      retryAfterSeconds: null,
      seedNotFound: {
        seedType: 'artist',
        names: names.slice(0, MAX_ARTISTS),
      },
    });
  });

  it('never attaches seed details to other failures', () => {
    const failure = describeAiGenerationFailure(new CatalogUnavailableError());

    expect(failure.category).toBe('provider_unavailable');
    expect(failure.seedNotFound).toBeNull();
  });

  it.each([
    ['spotify', 480],
    ['blendify', 20],
  ] as const)(
    'keeps the %s origin of a Spotify limit wait',
    (source, seconds) => {
      const failure = describeAiGenerationFailure(
        createSpotifyQuotaError({
          retryAfterSeconds: seconds,
          retryAfterSource: source,
          reason: 'rate_limit',
        }),
      );

      expect(failure).toMatchObject({
        category: 'provider_rate_limited',
        retryAfterSeconds: seconds,
        retryAfterSource: source,
      });
    },
  );

  it('reports no origin when a Spotify limit has no known wait', () => {
    const failure = describeAiGenerationFailure(
      createSpotifyQuotaError({
        retryAfterSeconds: null,
        retryAfterSource: null,
        reason: 'QUOTA_EXCEEDED',
      }),
    );

    expect(failure.retryAfterSeconds).toBeNull();
    expect(failure).not.toHaveProperty('retryAfterSource');
  });
});
