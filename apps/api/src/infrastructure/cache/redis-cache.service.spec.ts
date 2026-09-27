import {
  DELETE_IF_VALUE_SCRIPT,
  RENEW_IF_VALUE_SCRIPT,
  RedisCacheService,
  SET_JSON_IF_FIELDS_SCRIPT,
  sanitizeRedisUrl,
} from './redis-cache.service';
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

  it('grants a key only once until its owner deletes it', async () => {
    const config = {
      get: () => 'redis://127.0.0.1:1',
    } as unknown as ConfigService;
    const cache = new RedisCacheService(new RedisConnection(config));

    await expect(
      cache.setIfAbsent('blendify:test:lock', 'owner-a', 60_000),
    ).resolves.toBe(true);
    await expect(
      cache.setIfAbsent('blendify:test:lock', 'owner-b', 60_000),
    ).resolves.toBe(false);
    await expect(cache.exists('blendify:test:lock')).resolves.toBe(true);

    await cache.deleteIfValue('blendify:test:lock', 'owner-b');
    await expect(cache.exists('blendify:test:lock')).resolves.toBe(true);

    await cache.deleteIfValue('blendify:test:lock', 'owner-a');
    await expect(cache.exists('blendify:test:lock')).resolves.toBe(false);
    await expect(
      cache.setIfAbsent('blendify:test:lock', 'owner-b', 60_000),
    ).resolves.toBe(true);
  });

  it('renews an owned key only for its owner', async () => {
    jest.useFakeTimers();
    try {
      const config = {
        get: () => 'redis://127.0.0.1:1',
      } as unknown as ConfigService;
      const cache = new RedisCacheService(new RedisConnection(config));
      await cache.setIfAbsent('blendify:test:lease', 'owner-a', 1_000);

      await expect(
        cache.renewIfValue('blendify:test:lease', 'owner-b', 5_000),
      ).resolves.toBe(false);
      await expect(
        cache.renewIfValue('blendify:test:lease', 'owner-a', 5_000),
      ).resolves.toBe(true);
      jest.advanceTimersByTime(2_000);

      await expect(cache.exists('blendify:test:lease')).resolves.toBe(true);
      jest.advanceTimersByTime(4_000);
      await expect(cache.exists('blendify:test:lease')).resolves.toBe(false);
      await expect(
        cache.renewIfValue('blendify:test:lease', 'owner-a', 5_000),
      ).resolves.toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('replaces JSON only while the expected fields still match', async () => {
    const config = {
      get: () => 'redis://127.0.0.1:1',
    } as unknown as ConfigService;
    const cache = new RedisCacheService(new RedisConnection(config));
    const expected = {
      'execution.status': 'generating',
      'execution.attemptId': 'attempt-a',
    };
    await cache.setJson(
      'blendify:test:session',
      { execution: { status: 'generating', attemptId: 'attempt-b' } },
      60_000,
    );

    await expect(
      cache.setJsonIfFields(
        'blendify:test:session',
        { execution: { status: 'generated' } },
        60_000,
        expected,
      ),
    ).resolves.toBe(false);
    await expect(cache.getJson('blendify:test:session')).resolves.toEqual({
      execution: { status: 'generating', attemptId: 'attempt-b' },
    });

    await cache.setJson(
      'blendify:test:session',
      { execution: { status: 'generating', attemptId: 'attempt-a' } },
      60_000,
    );
    await expect(
      cache.setJsonIfFields(
        'blendify:test:session',
        { execution: { status: 'generated' } },
        60_000,
        expected,
      ),
    ).resolves.toBe(true);
    await expect(cache.getJson('blendify:test:session')).resolves.toEqual({
      execution: { status: 'generated' },
    });
    await expect(
      cache.setJsonIfFields('blendify:test:missing', {}, 60_000, expected),
    ).resolves.toBe(false);
  });

  it('redacts passwords in Redis URLs', () => {
    expect(sanitizeRedisUrl('redis://:s3cret@localhost:6379/0')).toContain(
      '***',
    );
    expect(sanitizeRedisUrl('redis://localhost:6379')).toContain('localhost');
    expect(sanitizeRedisUrl('not-a-url')).toBe('redis://***');
  });
});

describe('RedisCacheService with Redis', () => {
  function withClient(client: Record<string, jest.Mock>) {
    const connection = {
      readyClient: () => client,
    } as unknown as RedisConnection;
    return new RedisCacheService(connection);
  }

  it('acquires with the owner value, NX and a millisecond TTL', async () => {
    const set = jest
      .fn()
      .mockResolvedValueOnce('OK')
      .mockResolvedValueOnce(null);
    const cache = withClient({ set });

    await expect(cache.setIfAbsent('lock', 'owner-a', 5_000)).resolves.toBe(
      true,
    );
    await expect(cache.setIfAbsent('lock', 'owner-b', 5_000)).resolves.toBe(
      false,
    );
    expect(set).toHaveBeenCalledWith('lock', 'owner-a', 'PX', 5_000, 'NX');
  });

  it('renews through one atomic compare-and-expire script', async () => {
    const evalMock = jest
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    const cache = withClient({ eval: evalMock });

    await expect(cache.renewIfValue('lock', 'owner-a', 5_000)).resolves.toBe(
      true,
    );
    await expect(cache.renewIfValue('lock', 'owner-b', 5_000)).resolves.toBe(
      false,
    );
    expect(evalMock).toHaveBeenCalledWith(
      RENEW_IF_VALUE_SCRIPT,
      1,
      'lock',
      'owner-a',
      5_000,
    );
    expect(RENEW_IF_VALUE_SCRIPT).toContain("redis.call('PEXPIRE'");
  });

  it('propagates a Redis failure on renewal instead of reporting a lost lease', async () => {
    const cache = withClient({
      eval: jest.fn().mockRejectedValue(new Error('Command timed out')),
    });

    await expect(cache.renewIfValue('lock', 'owner-a', 5_000)).rejects.toThrow(
      'Command timed out',
    );
  });

  it('replaces JSON through one atomic conditional script', async () => {
    const evalMock = jest.fn().mockResolvedValue(1);
    const cache = withClient({ eval: evalMock });

    await expect(
      cache.setJsonIfFields('session', { ok: true }, 60_000, {
        'execution.attemptId': 'attempt-a',
      }),
    ).resolves.toBe(true);
    expect(evalMock).toHaveBeenCalledWith(
      SET_JSON_IF_FIELDS_SCRIPT,
      1,
      'session',
      '{"ok":true}',
      60_000,
      'execution.attemptId',
      'attempt-a',
    );
  });

  it('releases through one atomic compare-and-delete script', async () => {
    const evalMock = jest.fn().mockResolvedValue(0);
    const cache = withClient({ eval: evalMock });

    await cache.deleteIfValue('lock', 'stale-owner');

    expect(evalMock).toHaveBeenCalledWith(
      DELETE_IF_VALUE_SCRIPT,
      1,
      'lock',
      'stale-owner',
    );
    expect(DELETE_IF_VALUE_SCRIPT).toContain(
      "redis.call('GET', KEYS[1]) == ARGV[1]",
    );
  });
});
