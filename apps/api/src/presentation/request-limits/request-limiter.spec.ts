import { Logger } from '@nestjs/common';
import { MemoryRequestLimitStore } from '../../infrastructure/request-limits/memory-request-limit.store';
import {
  RequestLimitStoreUnavailableError,
  type RequestLimitStore,
} from '../../infrastructure/request-limits/request-limit.store';
import { RequestLimitError } from '../http/request-limit.error';
import type { ClientIdentity } from './client-identity';
import { RequestLimiter } from './request-limiter';
import {
  DEFAULT_GENERATION_CONCURRENCY,
  DEFAULT_RATE_LIMITS,
  type RequestLimitsConfig,
} from './request-limits.config';

const anonymous: ClientIdentity = { kind: 'ip', key: 'ip:203.0.113.7' };
const user: ClientIdentity = { kind: 'user', key: 'u:user-1' };

function config(overrides: Partial<RequestLimitsConfig> = {}) {
  return {
    production: false,
    rateLimits: {
      ...DEFAULT_RATE_LIMITS,
      search: { ...DEFAULT_RATE_LIMITS.search, limit: 2 },
      generation: { ...DEFAULT_RATE_LIMITS.generation, limit: 2 },
    },
    concurrency: { ...DEFAULT_GENERATION_CONCURRENCY, perClient: 1, global: 2 },
    ...overrides,
  };
}

function unavailableStore(): RequestLimitStore {
  const fail = () => Promise.reject(new RequestLimitStoreUnavailableError());
  return {
    isAvailable: () => false,
    hit: fail,
    acquire: fail,
    renew: fail,
    release: fail,
  };
}

function failingStore(): RequestLimitStore {
  const fail = () => Promise.reject(new RequestLimitStoreUnavailableError());
  return {
    isAvailable: () => true,
    hit: fail,
    acquire: fail,
    renew: fail,
    release: fail,
  };
}

async function rejection(
  promise: Promise<unknown>,
): Promise<RequestLimitError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof RequestLimitError) return error;
    throw error;
  }
  throw new Error('Expected a RequestLimitError');
}

describe('RequestLimiter', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    warn.mockRestore();
    jest.useRealTimers();
  });

  describe('rate limiting', () => {
    it('allows requests within the limit and rejects the next one', async () => {
      const limiter = new RequestLimiter(
        null,
        new MemoryRequestLimitStore(),
        config(),
      );
      await limiter.consume('search', anonymous);
      await limiter.consume('search', anonymous);

      const error = await rejection(limiter.consume('search', anonymous));
      expect(error.code).toBe('RATE_LIMITED');
      expect(error.statusCode).toBe(429);
      expect(error.retryAfterSeconds).toBe(60);
    });

    it('keeps identities and buckets independent', async () => {
      const limiter = new RequestLimiter(
        null,
        new MemoryRequestLimitStore(),
        config(),
      );
      await limiter.consume('search', anonymous);
      await limiter.consume('search', anonymous);

      await expect(limiter.consume('search', user)).resolves.toBeUndefined();
      await expect(
        limiter.consume('similar', anonymous),
      ).resolves.toBeUndefined();
    });

    it('logs rejections without the raw identity', async () => {
      const limiter = new RequestLimiter(
        null,
        new MemoryRequestLimitStore(),
        config(),
      );
      await limiter.consume('search', anonymous);
      await limiter.consume('search', anonymous);
      await rejection(limiter.consume('search', anonymous));

      const line = String((warn.mock.calls as unknown[][]).at(-1)?.[0]);
      expect(JSON.parse(line)).toMatchObject({
        event: 'request_limit.rejected',
        bucket: 'search',
        identityKind: 'ip',
      });
      expect(line).not.toContain('203.0.113.7');
    });
  });

  describe('store unavailable', () => {
    it('falls back to memory outside production', async () => {
      const limiter = new RequestLimiter(
        failingStore(),
        new MemoryRequestLimitStore(),
        config(),
      );
      await limiter.consume('generation', anonymous);
      await limiter.consume('generation', anonymous);
      await expect(
        rejection(limiter.consume('generation', anonymous)),
      ).resolves.toMatchObject({ code: 'RATE_LIMITED' });
    });

    it.each(['search', 'similar'] as const)(
      'fails open for %s in production',
      async (bucket) => {
        const limiter = new RequestLimiter(
          unavailableStore(),
          new MemoryRequestLimitStore(),
          config({ production: true }),
        );
        for (let i = 0; i < 5; i += 1) {
          await expect(limiter.consume(bucket, user)).resolves.toBeUndefined();
        }
      },
    );

    it.each(['resolve', 'generation', 'transfer'] as const)(
      'fails closed for %s in production, whether authenticated or not',
      async (bucket) => {
        const limiter = new RequestLimiter(
          failingStore(),
          new MemoryRequestLimitStore(),
          config({ production: true }),
        );
        for (const identity of [user, anonymous]) {
          const error = await rejection(limiter.consume(bucket, identity));
          expect(error.code).toBe('SERVICE_UNAVAILABLE');
          expect(error.statusCode).toBe(503);
          expect(error.message).not.toMatch(/redis/i);
        }
      },
    );

    it('fails closed for generation concurrency in production', async () => {
      const limiter = new RequestLimiter(
        unavailableStore(),
        new MemoryRequestLimitStore(),
        config({ production: true }),
      );
      await expect(
        rejection(limiter.acquireGenerationPermit(user)),
      ).resolves.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    });
  });

  describe('generation permits', () => {
    it('rejects a second concurrent generation for the same client', async () => {
      const limiter = new RequestLimiter(
        null,
        new MemoryRequestLimitStore(),
        config(),
      );
      const permit = await limiter.acquireGenerationPermit(anonymous);

      const error = await rejection(limiter.acquireGenerationPermit(anonymous));
      expect(error).toMatchObject({
        code: 'CONCURRENCY_LIMITED',
        statusCode: 429,
      });

      await permit.release();
      await expect(
        limiter.acquireGenerationPermit(anonymous),
      ).resolves.toBeDefined();
    });

    it('rejects with capacity exceeded when the global cap is reached', async () => {
      const limiter = new RequestLimiter(
        null,
        new MemoryRequestLimitStore(),
        config(),
      );
      await limiter.acquireGenerationPermit({ kind: 'ip', key: 'ip:a' });
      await limiter.acquireGenerationPermit({ kind: 'ip', key: 'ip:b' });

      const error = await rejection(
        limiter.acquireGenerationPermit({ kind: 'ip', key: 'ip:c' }),
      );
      expect(error).toMatchObject({
        code: 'CAPACITY_EXCEEDED',
        statusCode: 503,
      });
    });

    it('never exceeds the caps under concurrent acquisition', async () => {
      const limiter = new RequestLimiter(
        null,
        new MemoryRequestLimitStore(),
        config(),
      );
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, (_, i) =>
          limiter.acquireGenerationPermit({ kind: 'ip', key: `ip:${i % 3}` }),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    });

    it('renews the lease so a long operation keeps its permit', async () => {
      jest.useFakeTimers();
      const limiter = new RequestLimiter(
        null,
        new MemoryRequestLimitStore(),
        config(),
      );
      const permit = await limiter.acquireGenerationPermit(anonymous);

      await jest.advanceTimersByTimeAsync(
        DEFAULT_GENERATION_CONCURRENCY.leaseMs * 4,
      );

      await expect(
        rejection(limiter.acquireGenerationPermit(anonymous)),
      ).resolves.toMatchObject({ code: 'CONCURRENCY_LIMITED' });
      expect(warn).not.toHaveBeenCalledWith(
        expect.stringContaining('permit_lost'),
      );
      await permit.release();
    });

    it('stops renewing on release', async () => {
      jest.useFakeTimers();
      const store = new MemoryRequestLimitStore();
      const renew = jest.spyOn(store, 'renew');
      const limiter = new RequestLimiter(null, store, config());
      const permit = await limiter.acquireGenerationPermit(anonymous);

      await jest.advanceTimersByTimeAsync(
        DEFAULT_GENERATION_CONCURRENCY.renewIntervalMs,
      );
      expect(renew).toHaveBeenCalledTimes(1);

      await permit.release();
      await jest.advanceTimersByTimeAsync(
        DEFAULT_GENERATION_CONCURRENCY.renewIntervalMs * 5,
      );
      expect(renew).toHaveBeenCalledTimes(1);
      expect(permit.isReleased).toBe(true);
    });

    it('recovers a permit abandoned without release after the lease', async () => {
      jest.useFakeTimers();
      const store = new MemoryRequestLimitStore();
      const limiter = new RequestLimiter(null, store, config());
      await limiter.acquireGenerationPermit(anonymous);
      jest.spyOn(store, 'renew').mockResolvedValue(false);

      await jest.advanceTimersByTimeAsync(
        DEFAULT_GENERATION_CONCURRENCY.leaseMs + 1,
      );

      await expect(
        limiter.acquireGenerationPermit(anonymous),
      ).resolves.toBeDefined();
    });

    it('logs a lost permit instead of dropping it silently', async () => {
      jest.useFakeTimers();
      const store = new MemoryRequestLimitStore();
      const limiter = new RequestLimiter(null, store, config());
      const permit = await limiter.acquireGenerationPermit(anonymous);
      jest.spyOn(store, 'renew').mockResolvedValue(false);

      await jest.advanceTimersByTimeAsync(
        DEFAULT_GENERATION_CONCURRENCY.renewIntervalMs,
      );

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('request_limit.permit_lost'),
      );
      await permit.release();
    });
  });
});
