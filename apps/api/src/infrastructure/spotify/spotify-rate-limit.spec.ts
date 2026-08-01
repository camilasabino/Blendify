import axios from 'axios';
import {
  __resetSpotifyRateLimitForTests,
  attachSpotifyRateLimit,
  getSpotifyQuotaRetryAfterSeconds,
  isSpotifyQuotaBlocked,
} from './spotify-rate-limit';

describe('spotify-rate-limit fail-fast', () => {
  beforeEach(() => {
    __resetSpotifyRateLimitForTests();
  });

  it('blocks subsequent requests for the full Retry-After window', async () => {
    const api = axios.create({ baseURL: 'https://example.test' });
    attachSpotifyRateLimit(api);

    // Simulate a 429 response through the interceptor by invoking the
    // response error handler via a rejected adapter-style call.
    api.defaults.adapter = async (config) => {
      if (isSpotifyQuotaBlocked()) {
        throw Object.assign(new Error('should not probe'), { config });
      }
      const error = new axios.AxiosError(
        'Too many requests',
        'ERR_BAD_RESPONSE',
        config,
        undefined,
        {
          status: 429,
          statusText: 'Too Many Requests',
          data: { error: { reason: 'QUOTA_EXCEEDED', message: 'quota' } },
          headers: { 'retry-after': '120' },
          config,
        },
      );
      return Promise.reject(error);
    };

    await expect(api.get('/v1/search')).rejects.toBeTruthy();
    expect(isSpotifyQuotaBlocked()).toBe(true);
    expect(getSpotifyQuotaRetryAfterSeconds()).toBeGreaterThan(100);

    // Second call must fail fast without hitting the adapter probe path.
    let adapterHits = 0;
    api.defaults.adapter = (config) => {
      adapterHits += 1;
      return Promise.resolve({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });
    };

    await expect(api.get('/v1/search')).rejects.toMatchObject({
      response: { status: 429 },
    });
    expect(adapterHits).toBe(0);
  });
});
