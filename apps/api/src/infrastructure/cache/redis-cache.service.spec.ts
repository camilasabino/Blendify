import { RedisCacheService } from './redis-cache.service';
import { ConfigService } from '@nestjs/config';

describe('RedisCacheService memory fallback', () => {
  it('stores and reads JSON without a Redis connection', async () => {
    const config = {
      get: () => 'redis://127.0.0.1:1',
    } as unknown as ConfigService;
    const cache = new RedisCacheService(config);

    await cache.setJson('blendify:test:key', { ok: true }, 60_000);
    await expect(
      cache.getJson<{ ok: boolean }>('blendify:test:key'),
    ).resolves.toEqual({ ok: true });
  });
});
