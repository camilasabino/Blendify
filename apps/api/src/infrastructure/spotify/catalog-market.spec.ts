import {
  normalizeMarket,
  parseConfiguredMarket,
  resolveCatalogMarket,
} from './catalog-market';

describe('catalog market', () => {
  it.each([
    ['ar', 'AR'],
    [' BR ', 'BR'],
    ['US', 'US'],
  ])('normalizes %p to %p', (input, expected) => {
    expect(normalizeMarket(input)).toBe(expected);
  });

  it.each([undefined, null, '', 'ARG', 'A1', 'from_token'])(
    'rejects %p as a market',
    (input) => {
      expect(normalizeMarket(input)).toBeUndefined();
    },
  );

  it('prefers a valid explicit market over the configured one', () => {
    expect(resolveCatalogMarket('br', 'AR')).toBe('BR');
  });

  it('falls back to the configured market when none is supplied or valid', () => {
    expect(resolveCatalogMarket(undefined, 'AR')).toBe('AR');
    expect(resolveCatalogMarket(null, 'AR')).toBe('AR');
    expect(resolveCatalogMarket('invalid', 'AR')).toBe('AR');
  });

  it('accepts a valid configured market', () => {
    expect(parseConfiguredMarket(' ar ')).toBe('AR');
  });

  it.each([undefined, '', '  ', 'ARG', 'Argentina'])(
    'requires a valid configured market (%p)',
    (value) => {
      expect(() => parseConfiguredMarket(value)).toThrow(
        'SPOTIFY_CATALOG_MARKET is required and must be an ISO 3166-1 alpha-2 country code',
      );
    },
  );
});
