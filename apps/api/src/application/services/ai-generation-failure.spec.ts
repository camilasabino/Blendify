import { MAX_ARTISTS } from '@blendify/contracts';
import { AiGenerationError } from '@/domain/errors/ai-generation.error';
import { CatalogUnavailableError } from '@/domain/errors/catalog-unavailable.error';
import { ProviderOutcomeUnknownError } from '@/domain/errors/provider-outcome-unknown.error';
import { SpotifyProviderError } from '@/domain/errors/spotify-provider.error';
import { SpotifyReauthRequiredError } from '@/domain/errors/spotify-reauth-required.error';
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

  it('keeps a rejected Spotify request instead of an internal error', () => {
    expect(
      describeAiGenerationFailure(
        new SpotifyProviderError('SPOTIFY_REQUEST_REJECTED', {
          operation: 'searchTracks',
          category: 'rejected',
          status: 400,
        }),
      ),
    ).toMatchObject({
      code: 'SPOTIFY_REQUEST_REJECTED',
      category: 'failed',
      seedNotFound: null,
    });
  });

  it('keeps a Spotify read timeout as a provider outage', () => {
    expect(
      describeAiGenerationFailure(
        new SpotifyProviderError('SPOTIFY_UNAVAILABLE', {
          operation: 'searchTracks',
          category: 'timeout',
          status: null,
        }),
      ),
    ).toMatchObject({
      code: 'SPOTIFY_UNAVAILABLE',
      category: 'provider_unavailable',
      seedNotFound: null,
    });
  });

  it.each([
    [
      'a revoked Spotify session',
      new SpotifyReauthRequiredError(),
      'SPOTIFY_REAUTH_REQUIRED',
    ],
    [
      'an unconfirmed Spotify write',
      new ProviderOutcomeUnknownError('timeout', {
        operation: 'createPlaylist',
        category: 'timeout',
        status: null,
      }),
      'SPOTIFY_OUTCOME_UNKNOWN',
    ],
  ])('keeps %s', (_label, error, code) => {
    expect(describeAiGenerationFailure(error)).toMatchObject({
      code,
      category: 'failed',
      seedNotFound: null,
    });
  });

  it('leaves an unexpected error unclassified', () => {
    expect(describeAiGenerationFailure(new Error('boom'))).toMatchObject({
      code: 'INTERNAL_ERROR',
      category: 'failed',
      seedNotFound: null,
    });
  });
});
