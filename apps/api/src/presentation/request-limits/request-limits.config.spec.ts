import {
  DEFAULT_GENERATION_CONCURRENCY,
  DEFAULT_RATE_LIMITS,
  loadRequestLimitsConfig,
  parseTrustProxy,
  resolveRateLimits,
} from './request-limits.config';

describe('resolveRateLimits', () => {
  it('uses the code defaults when no override is set', () => {
    expect(resolveRateLimits(undefined)).toEqual(DEFAULT_RATE_LIMITS);
    expect(resolveRateLimits('  ')).toEqual(DEFAULT_RATE_LIMITS);
  });

  it('overrides limit and window in seconds but keeps the store policy', () => {
    const limits = resolveRateLimits(' generation=20/600 , search=120/30');
    expect(limits.generation).toEqual({
      limit: 20,
      windowMs: 600_000,
      onStoreUnavailable: 'fail-closed',
    });
    expect(limits.search).toEqual({
      limit: 120,
      windowMs: 30_000,
      onStoreUnavailable: 'fail-open',
    });
    expect(limits.resolve).toEqual(DEFAULT_RATE_LIMITS.resolve);
  });

  it('defines a fail-closed transfer bucket that can be overridden', () => {
    expect(DEFAULT_RATE_LIMITS.transfer).toEqual({
      limit: 10,
      windowMs: 600_000,
      onStoreUnavailable: 'fail-closed',
    });
    expect(resolveRateLimits('transfer=3/60').transfer).toEqual({
      limit: 3,
      windowMs: 60_000,
      onStoreUnavailable: 'fail-closed',
    });
  });

  it.each([
    ['unknown bucket', 'upload=5/60', /unknown bucket "upload"/],
    ['duplicate bucket', 'search=5/60,search=6/60', /duplicate bucket/],
    ['zero limit', 'search=0/60', /positive integer/],
    ['negative window', 'search=5/-60', /positive integer/],
    ['decimal limit', 'search=1.5/60', /positive integer/],
    ['leading zero', 'search=05/60', /positive integer/],
    ['missing window', 'search=5', /malformed entry/],
    ['empty entry', 'search=5/60,', /malformed entry/],
    ['wrong separator', 'search:5/60', /malformed entry/],
  ])('rejects %s', (_label, raw, message) => {
    expect(() => resolveRateLimits(raw)).toThrow(message);
  });
});

describe('loadRequestLimitsConfig', () => {
  it('reads concurrency overrides and the production flag', () => {
    const env: Record<string, string> = {
      NODE_ENV: 'production',
      GENERATION_CONCURRENCY_PER_CLIENT: '1',
      GENERATION_CONCURRENCY_GLOBAL: '10',
    };
    const config = loadRequestLimitsConfig((name) => env[name]);
    expect(config.production).toBe(true);
    expect(config.concurrency).toEqual({
      ...DEFAULT_GENERATION_CONCURRENCY,
      perClient: 1,
      global: 10,
    });
  });

  it('fails on invalid concurrency values', () => {
    expect(() =>
      loadRequestLimitsConfig((name) =>
        name === 'GENERATION_CONCURRENCY_GLOBAL' ? 'many' : undefined,
      ),
    ).toThrow(/GENERATION_CONCURRENCY_GLOBAL/);
  });
});

describe('parseTrustProxy', () => {
  it('trusts nothing by default', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('')).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('0')).toBe(false);
  });

  it('refuses to trust every proxy', () => {
    expect(() => parseTrustProxy('true')).toThrow(/not allowed/);
  });

  it('accepts a hop count', () => {
    expect(parseTrustProxy('2')).toBe(2);
  });

  it('accepts addresses, CIDRs and keywords', () => {
    expect(
      parseTrustProxy('loopback, 10.0.0.0/8, 2001:db8::/32, 192.0.2.1'),
    ).toEqual(['loopback', '10.0.0.0/8', '2001:db8::/32', '192.0.2.1']);
  });

  it.each(['everything', '10.0.0.0/33', '10.0.0.1/8/1', 'loopback,,', '-1'])(
    'rejects %s',
    (raw) => {
      expect(() => parseTrustProxy(raw)).toThrow(/Invalid TRUST_PROXY/);
    },
  );
});
