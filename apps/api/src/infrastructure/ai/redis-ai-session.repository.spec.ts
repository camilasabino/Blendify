import {
  AI_SESSION_RECORD_VERSION,
  type AiSession,
} from '@/domain/ai/ai-session';
import type { RedisCacheService } from '@/infrastructure/cache/redis-cache.service';
import { RedisAiSessionRepository } from './redis-ai-session.repository';

const TOKEN = 'opaque-client-token';

const SESSION: AiSession = {
  version: AI_SESSION_RECORD_VERSION,
  ownerUserId: null,
  originalPrompt: 'Shoegaze and dream pop',
  promptVersion: 'intent-v2',
  aiSafe: { intent: null },
  clarification: null,
  execution: null,
  destination: null,
  createdAt: '2026-09-27T12:00:00.000Z',
  updatedAt: '2026-09-27T12:00:00.000Z',
  expiresAt: '2026-09-27T12:30:00.000Z',
};

function createRepository(stored: unknown = null) {
  const cache = {
    getJson: jest.fn<Promise<unknown>, [string]>(() => Promise.resolve(stored)),
    setJson: jest.fn<Promise<void>, [string, unknown, number]>(() =>
      Promise.resolve(),
    ),
    setIfAbsent: jest.fn<Promise<boolean>, [string, string, number]>(() =>
      Promise.resolve(true),
    ),
    deleteIfValue: jest.fn<Promise<void>, [string, string]>(() =>
      Promise.resolve(),
    ),
    exists: jest.fn<Promise<boolean>, [string]>(() => Promise.resolve(true)),
    renewIfValue: jest.fn<Promise<boolean>, [string, string, number]>(() =>
      Promise.resolve(true),
    ),
    setJsonIfFields: jest.fn<
      Promise<boolean>,
      [string, unknown, number, Record<string, string>]
    >(() => Promise.resolve(true)),
  };
  const repository = new RedisAiSessionRepository(
    cache as unknown as RedisCacheService,
  );
  return { cache, repository };
}

describe('RedisAiSessionRepository', () => {
  it('stores the session under a hash of the client token with the given TTL', async () => {
    const { cache, repository } = createRepository();

    await repository.save(TOKEN, SESSION, 60_000);

    const [key, value, ttlMs] = cache.setJson.mock.calls[0];
    expect(key).toMatch(/^blendify:ai:session:[0-9a-f]{64}$/);
    expect(key).not.toContain(TOKEN);
    expect(value).toEqual(SESSION);
    expect(ttlMs).toBe(60_000);
  });

  it('reads the session back through the same hashed key', async () => {
    const { cache, repository } = createRepository(SESSION);

    await repository.save(TOKEN, SESSION, 60_000);
    const found = await repository.find(TOKEN);

    expect(found).toEqual(SESSION);
    expect(cache.getJson).toHaveBeenCalledWith(cache.setJson.mock.calls[0][0]);
  });

  it('ignores records written with another session format', async () => {
    const { repository } = createRepository({ ...SESSION, version: 0 });

    await expect(repository.find(TOKEN)).resolves.toBeNull();
  });

  it('ignores M1 records that carried provider-resolved execution state', async () => {
    const { repository } = createRepository({
      ...SESSION,
      version: 1,
      execution: { resolvedSeeds: { artists: [], genres: [], track: null } },
    });

    await expect(repository.find(TOKEN)).resolves.toBeNull();
  });

  it('guards generation with an owned lease on a hashed per-session lock key', async () => {
    const { cache, repository } = createRepository();

    const leaseId = await repository.acquireGenerationLock(TOKEN, 5_000);
    await repository.releaseGenerationLock(TOKEN, leaseId ?? '');

    const [lockKey, storedLease, ttlMs] = cache.setIfAbsent.mock.calls[0];
    expect(lockKey).toMatch(/^blendify:ai:generation-lock:[0-9a-f]{64}$/);
    expect(lockKey).not.toContain(TOKEN);
    expect(leaseId).toMatch(/^[0-9a-f-]{36}$/);
    expect(storedLease).toBe(leaseId);
    expect(ttlMs).toBe(5_000);
    expect(cache.deleteIfValue).toHaveBeenCalledWith(lockKey, leaseId);
    await expect(repository.hasGenerationLock(TOKEN)).resolves.toBe(true);
    expect(cache.exists).toHaveBeenCalledWith(lockKey);
  });

  it('issues a distinct lease per acquisition and none when the lock is held', async () => {
    const { cache, repository } = createRepository();

    const first = await repository.acquireGenerationLock(TOKEN, 5_000);
    const second = await repository.acquireGenerationLock(TOKEN, 5_000);
    cache.setIfAbsent.mockResolvedValueOnce(false);

    expect(first).not.toBe(second);
    await expect(
      repository.acquireGenerationLock(TOKEN, 5_000),
    ).resolves.toBeNull();
  });

  it('renews the lease through an owner-checked renewal of the same key', async () => {
    const { cache, repository } = createRepository();

    await expect(
      repository.renewGenerationLock(TOKEN, 'lease-a', 5_000),
    ).resolves.toBe(true);

    const [lockKey, leaseId, ttlMs] = cache.renewIfValue.mock.calls[0];
    expect(lockKey).toMatch(/^blendify:ai:generation-lock:[0-9a-f]{64}$/);
    expect(leaseId).toBe('lease-a');
    expect(ttlMs).toBe(5_000);
  });

  it('persists a generation outcome only for the attempt that still owns the session', async () => {
    const { cache, repository } = createRepository();

    await repository.saveGenerationOutcome(TOKEN, SESSION, 'attempt-a', 60_000);

    const [key, value, ttlMs, expected] = cache.setJsonIfFields.mock.calls[0];
    expect(key).toMatch(/^blendify:ai:session:[0-9a-f]{64}$/);
    expect(value).toEqual(SESSION);
    expect(ttlMs).toBe(60_000);
    expect(expected).toEqual({
      'execution.status': 'generating',
      'execution.attemptId': 'attempt-a',
    });
  });

  it('claims a destination once per session under a hashed key and releases only its own claim', async () => {
    const { cache, repository } = createRepository();

    const claimId = await repository.acquireDestinationClaim(TOKEN, 90_000);
    cache.setIfAbsent.mockResolvedValueOnce(false);
    const second = await repository.acquireDestinationClaim(TOKEN, 90_000);
    await repository.releaseDestinationClaim(TOKEN, claimId ?? '');

    const [key, value, ttlMs] = cache.setIfAbsent.mock.calls[0];
    expect(key).toMatch(/^blendify:ai:destination-claim:[0-9a-f]{64}$/);
    expect(key).not.toContain(TOKEN);
    expect(value).toBe(claimId);
    expect(ttlMs).toBe(90_000);
    expect(second).toBeNull();
    expect(cache.deleteIfValue).toHaveBeenCalledWith(key, claimId);
  });

  it('renews and checks the destination lease on the same owner-checked key', async () => {
    const { cache, repository } = createRepository();

    await expect(
      repository.renewDestinationClaim(TOKEN, 'claim-a', 30_000),
    ).resolves.toBe(true);
    await expect(repository.hasDestinationClaim(TOKEN)).resolves.toBe(true);

    const [key, claimId, ttlMs] = cache.renewIfValue.mock.calls[0];
    expect(key).toMatch(/^blendify:ai:destination-claim:[0-9a-f]{64}$/);
    expect(claimId).toBe('claim-a');
    expect(ttlMs).toBe(30_000);
    expect(cache.exists).toHaveBeenCalledWith(key);
  });

  it('persists a publish outcome only for the attempt that still owns the destination', async () => {
    const { cache, repository } = createRepository();

    await repository.savePublishOutcome(TOKEN, SESSION, 'attempt-a', 60_000);

    const [key, value, ttlMs, expected] = cache.setJsonIfFields.mock.calls[0];
    expect(key).toMatch(/^blendify:ai:session:[0-9a-f]{64}$/);
    expect(value).toEqual(SESSION);
    expect(ttlMs).toBe(60_000);
    expect(expected).toEqual({
      'destination.status': 'publishing',
      'destination.attemptId': 'attempt-a',
    });
  });
});
