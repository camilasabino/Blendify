import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { RedisCacheService } from './redis-cache.service';
import { RedisConnection } from './redis-connection';

const redisUrl = process.env.REDIS_TEST_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

describeWithRedis('RedisCacheService owned keys against real Redis', () => {
  let connection: RedisConnection;
  let cache: RedisCacheService;

  beforeAll(async () => {
    connection = new RedisConnection({
      get: () => redisUrl,
    } as unknown as ConfigService);
    await connection.onModuleInit();
    cache = new RedisCacheService(connection);
  });

  afterAll(async () => {
    await connection.onModuleDestroy();
  });

  it('deletes a key only for the owner that set it', async () => {
    const key = `blendify:test:${randomUUID()}`;

    await expect(cache.setIfAbsent(key, 'owner-a', 5_000)).resolves.toBe(true);
    await expect(cache.setIfAbsent(key, 'owner-b', 5_000)).resolves.toBe(false);

    await cache.deleteIfValue(key, 'owner-b');
    await expect(cache.exists(key)).resolves.toBe(true);

    await cache.deleteIfValue(key, 'owner-a');
    await expect(cache.exists(key)).resolves.toBe(false);
  });

  it('lets a new owner acquire after the lease expires, safe from the old owner', async () => {
    const key = `blendify:test:${randomUUID()}`;

    await cache.setIfAbsent(key, 'owner-a', 50);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect(cache.setIfAbsent(key, 'owner-b', 5_000)).resolves.toBe(true);

    await cache.deleteIfValue(key, 'owner-a');
    await expect(cache.exists(key)).resolves.toBe(true);
    await cache.deleteIfValue(key, 'owner-b');
  });

  it('renews a key only for its owner', async () => {
    const key = `blendify:test:${randomUUID()}`;

    await cache.setIfAbsent(key, 'owner-a', 200);
    await expect(cache.renewIfValue(key, 'owner-b', 5_000)).resolves.toBe(
      false,
    );
    await expect(cache.renewIfValue(key, 'owner-a', 5_000)).resolves.toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 300));

    await expect(cache.exists(key)).resolves.toBe(true);
    await cache.deleteIfValue(key, 'owner-a');
    await expect(cache.renewIfValue(key, 'owner-a', 5_000)).resolves.toBe(
      false,
    );
  });

  it('replaces a JSON document only while nested fields match', async () => {
    const key = `blendify:test:${randomUUID()}`;
    const expected = {
      'execution.status': 'generating',
      'execution.attemptId': 'attempt-a',
    };

    await cache.setJson(
      key,
      { execution: { status: 'generating', attemptId: 'attempt-b' } },
      5_000,
    );
    await expect(
      cache.setJsonIfFields(key, { execution: null }, 5_000, expected),
    ).resolves.toBe(false);

    await cache.setJson(
      key,
      { execution: { status: 'generating', attemptId: 'attempt-a' } },
      5_000,
    );
    await expect(
      cache.setJsonIfFields(
        key,
        { execution: { status: 'generated' } },
        5_000,
        expected,
      ),
    ).resolves.toBe(true);
    await expect(cache.getJson(key)).resolves.toEqual({
      execution: { status: 'generated' },
    });
    await expect(
      cache.setJsonIfFields(key, { execution: null }, 5_000, expected),
    ).resolves.toBe(false);
    await expect(
      cache.setJsonIfFields(`${key}:missing`, {}, 5_000, expected),
    ).resolves.toBe(false);
  });
});
