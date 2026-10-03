import { AiGenerationError } from '@/domain/errors/ai-generation.error';
import { AiSessionError } from '@/domain/errors/ai-session.error';
import { CatalogUnavailableError } from '@/domain/errors/catalog-unavailable.error';
import { BusinessRuleError } from '@/domain/errors/business-rule.error';
import { ProviderOutcomeUnknownError } from '@/domain/errors/provider-outcome-unknown.error';
import { SpotifyProviderError } from '@/domain/errors/spotify-provider.error';
import { SpotifyReauthRequiredError } from '@/domain/errors/spotify-reauth-required.error';
import { TransferError } from '@/domain/errors/transfer.error';
import {
  retryAfterHeaderValue,
  toApiErrorResponse,
} from './api-error-response';

describe('toApiErrorResponse', () => {
  it('maps an unavailable catalog to a 503 without exposing the cause', () => {
    const response = toApiErrorResponse(
      new CatalogUnavailableError({
        cause: new Error('Spotify searchArtists failed (401): secret detail'),
      }),
    );

    expect(response).toEqual({
      statusCode: 503,
      code: 'CATALOG_UNAVAILABLE',
      message:
        'The music catalog is temporarily unavailable. Try again shortly.',
    });
  });

  it('passes the wait Spotify asked for on an unavailable read without Blendify estimates', () => {
    const failure = {
      operation: 'searchArtists',
      category: 'upstream_error' as const,
      status: 503,
      retryAfterSeconds: 30,
      retryAfterSource: 'spotify' as const,
    };

    const direct = toApiErrorResponse(
      new SpotifyProviderError('SPOTIFY_UNAVAILABLE', failure),
    );
    const catalog = toApiErrorResponse(
      new CatalogUnavailableError({
        cause: new SpotifyProviderError('SPOTIFY_UNAVAILABLE', failure),
      }),
    );

    expect(direct).toMatchObject({ statusCode: 503, details: failure });
    expect(catalog).toMatchObject({
      code: 'CATALOG_UNAVAILABLE',
      details: { retryAfterSeconds: 30, retryAfterSource: 'spotify' },
    });
    expect(retryAfterHeaderValue(direct)).toBe('30');
    expect(retryAfterHeaderValue(catalog)).toBe('30');
  });

  it('maps a revoked Spotify authorization to a typed 401 without the provider cause', () => {
    const response = toApiErrorResponse(
      new SpotifyReauthRequiredError({
        cause: new Error('invalid_grant: Refresh token revoked'),
      }),
    );

    expect(response).toEqual({
      statusCode: 401,
      code: 'SPOTIFY_REAUTH_REQUIRED',
      message: 'Spotify authorization is no longer valid. Reconnect Spotify.',
    });
  });

  it('keeps Spotify quota errors as 429', () => {
    expect(
      toApiErrorResponse(
        new BusinessRuleError('Spotify rate limit.', 'SPOTIFY_RATE_LIMITED'),
      ),
    ).toMatchObject({ statusCode: 429, code: 'SPOTIFY_RATE_LIMITED' });
  });

  it('keeps an empty selection as a 422 business error', () => {
    expect(toApiErrorResponse(BusinessRuleError.noTracksFound())).toMatchObject(
      { statusCode: 422, code: 'NO_TRACKS_FOUND' },
    );
  });

  it.each([
    [
      'empty mix or discover selection',
      BusinessRuleError.noTracksFound(),
      422,
      'NO_TRACKS_FOUND',
    ],
    [
      'not enough related music',
      new BusinessRuleError('similar', 'DISCOVER_NOT_ENOUGH_SIMILAR'),
      422,
      'DISCOVER_NOT_ENOUGH_SIMILAR',
    ],
    [
      'related music that did not resolve',
      new BusinessRuleError('resolve', 'DISCOVER_RESOLVE_FAILED'),
      422,
      'DISCOVER_RESOLVE_FAILED',
    ],
    [
      'Spotify rate limit',
      new BusinessRuleError('rate', 'SPOTIFY_RATE_LIMITED'),
      429,
      'SPOTIFY_RATE_LIMITED',
    ],
    [
      'Spotify quota',
      new BusinessRuleError('quota', 'SPOTIFY_QUOTA_EXCEEDED'),
      429,
      'SPOTIFY_QUOTA_EXCEEDED',
    ],
    [
      'catalog unavailable',
      new CatalogUnavailableError(),
      503,
      'CATALOG_UNAVAILABLE',
    ],
    [
      'Spotify timeout on a read',
      new SpotifyProviderError('SPOTIFY_UNAVAILABLE', {
        operation: 'searchTracks',
        category: 'timeout',
        status: null,
      }),
      503,
      'SPOTIFY_UNAVAILABLE',
    ],
    [
      'Spotify rejected request',
      new SpotifyProviderError('SPOTIFY_REQUEST_REJECTED', {
        operation: 'searchTracks',
        category: 'rejected',
        status: 400,
      }),
      502,
      'SPOTIFY_REQUEST_REJECTED',
    ],
    [
      'Spotify reauth',
      new SpotifyReauthRequiredError(),
      401,
      'SPOTIFY_REAUTH_REQUIRED',
    ],
    [
      'unconfirmed Spotify write',
      new ProviderOutcomeUnknownError('timeout', {
        operation: 'createPlaylist',
        category: 'timeout',
        status: null,
      }),
      502,
      'SPOTIFY_OUTCOME_UNKNOWN',
    ],
    ['unexpected failure', new Error('boom'), 500, 'INTERNAL_ERROR'],
  ] as const)('maps %s', (_label, error, statusCode, code) => {
    expect(toApiErrorResponse(error)).toMatchObject({ statusCode, code });
  });

  it.each([
    [TransferError.tokenInvalid(), 400, 'TRANSFER_TOKEN_INVALID'],
    [TransferError.tokenExpired(), 410, 'TRANSFER_TOKEN_EXPIRED'],
    [TransferError.playlistRejected(), 422, 'TRANSFER_PLAYLIST_REJECTED'],
  ])('maps %s without retry metadata', (error, statusCode, code) => {
    const response = toApiErrorResponse(error);

    expect(response).toMatchObject({ statusCode, code });
    expect(response).not.toHaveProperty('details');
  });

  it('maps an unavailable transfer provider to a retryable 503', () => {
    expect(toApiErrorResponse(TransferError.providerUnavailable(45))).toEqual({
      statusCode: 503,
      code: 'TRANSFER_PROVIDER_UNAVAILABLE',
      message:
        'The transfer service is temporarily unavailable. Try again shortly.',
      details: { retryAfterSeconds: 45 },
    });
  });

  it('maps a seed not found during AI generation to an editable 422', () => {
    expect(
      toApiErrorResponse(AiGenerationError.seedNotFound('track', ['Creeep'])),
    ).toEqual({
      statusCode: 422,
      code: 'AI_SEED_NOT_FOUND',
      message:
        'Some requested artists or tracks could not be found. Edit the request and try again.',
      details: { seedType: 'track', names: ['Creeep'] },
    });
  });

  it.each([
    AiSessionError.notReady(),
    AiSessionError.generationInProgress(),
    AiSessionError.generationSuperseded(),
  ])('maps the AI session state conflict %s to 409', (error) => {
    expect(toApiErrorResponse(error)).toEqual({
      statusCode: 409,
      code: error.code,
      message: error.message,
    });
  });
});
