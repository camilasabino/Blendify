import { RedisCacheService, sanitizeRedisUrl } from './redis-cache.service';
import { RedisConnection } from './redis-connection';
import { ConfigService } from '@nestjs/config';

describe('RedisCacheService memory fallback', () => {
  it('stores and reads JSON without a Redis connection', async () => {
    const config = {
      get: () => 'redis://127.0.0.1:1',
    } as unknown as ConfigService;
    const cache = new RedisCacheService(new RedisConnection(config));

    await cache.setJson('blendify:test:key', { ok: true }, 60_000);
    await expect(
      cache.getJson<{ ok: boolean }>('blendify:test:key'),
    ).resolves.toEqual({ ok: true });
  });

  it('redacts passwords in Redis URLs', () => {
    expect(sanitizeRedisUrl('redis://:s3cret@localhost:6379/0')).toContain(
      '***',
    );
    expect(sanitizeRedisUrl('redis://localhost:6379')).toContain('localhost');
    expect(sanitizeRedisUrl('not-a-url')).toBe('redis://***');
  });
});
