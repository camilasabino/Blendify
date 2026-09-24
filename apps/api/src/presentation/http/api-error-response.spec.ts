import { CatalogUnavailableError } from '../../domain/errors/catalog-unavailable.error';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import { toApiErrorResponse } from './api-error-response';

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
});
