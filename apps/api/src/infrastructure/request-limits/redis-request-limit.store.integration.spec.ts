import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { RedisConnection } from '../cache/redis-connection';
import { RedisRequestLimitStore } from './redis-request-limit.store';

const redisUrl = process.env.REDIS_TEST_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describeWithRedis('RedisRequestLimitStore against real Redis', () => {
  let connection: RedisConnection;
  let store: RedisRequestLimitStore;
  let prefix: string;

  beforeAll(async () => {
    connection = new RedisConnection({
      get: () => redisUrl,
    } as unknown as ConfigService);
    await connection.onModuleInit();
    store = new RedisRequestLimitStore(connection);
  });

  afterAll(async () => {
    await connection.onModuleDestroy();
  });

  beforeEach(() => {
    prefix = `blendify:test:${randomUUID()}`;
  });

  function permit(id: string, client = 'a', clientLimit = 2, globalLimit = 3) {
    return {
      permitId: id,
      clientKey: `${prefix}:{gen}:client:${client}`,
      globalKey: `${prefix}:{gen}:global`,
      clientLimit,
      globalLimit,
      leaseMs: 300,
    };
  }

  it('counts a fixed window with a TTL set on the first hit', async () => {
    const key = `${prefix}:rl`;
    const first = await store.hit(key, 1_000);
    const second = await store.hit(key, 1_000);

    expect(first.count).toBe(1);
    expect(first.resetInMs).toBeGreaterThan(900);
    expect(first.resetInMs).toBeLessThanOrEqual(1_000);
    expect(second.count).toBe(2);
    expect(second.resetInMs).toBeLessThanOrEqual(first.resetInMs);

    await sleep(1_050);
    await expect(store.hit(key, 1_000)).resolves.toMatchObject({ count: 1 });
  });

  it('counts concurrent hits exactly once each', async () => {
    const key = `${prefix}:rl`;
    const hits = await Promise.all(
      Array.from({ length: 50 }, () => store.hit(key, 5_000)),
    );
    const counts = hits.map((hit) => hit.count).sort((a, b) => a - b);
    expect(counts).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it('enforces per-client and global caps atomically', async () => {
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        store.acquire(permit(`p${i}`, `client-${i % 5}`)),
      ),
    );
    expect(results.filter((result) => result.acquired)).toHaveLength(3);

    const clientResults = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        store.acquire(permit(`q${i}`, 'solo', 2, 100)),
      ),
    );
    expect(clientResults.filter((result) => result.acquired)).toHaveLength(2);
    expect(clientResults.find((result) => !result.acquired)).toEqual({
      acquired: false,
      scope: 'client',
    });
  });

  it('frees capacity on release', async () => {
    await store.acquire(permit('p1'));
    await store.acquire(permit('p2'));
    await expect(store.acquire(permit('p3'))).resolves.toMatchObject({
      acquired: false,
      scope: 'client',
    });
    await store.release(permit('p1'));
    await expect(store.acquire(permit('p3'))).resolves.toEqual({
      acquired: true,
    });
  });

  it('recovers abandoned permits after the lease expires', async () => {
    await store.acquire(permit('p1'));
    await store.acquire(permit('p2'));
    await sleep(350);
    await expect(store.acquire(permit('p3'))).resolves.toEqual({
      acquired: true,
    });
    await expect(store.renew(permit('p1'), 300)).resolves.toBe(false);
  });

  it('keeps a renewed permit alive past its original lease', async () => {
    await store.acquire(permit('p1'));
    await store.acquire(permit('p2'));
    for (let i = 0; i < 4; i += 1) {
      await sleep(150);
      await expect(store.renew(permit('p1'), 300)).resolves.toBe(true);
    }
    await expect(store.acquire(permit('p3'))).resolves.toEqual({
      acquired: true,
    });
    await expect(store.acquire(permit('p4'))).resolves.toEqual({
      acquired: false,
      scope: 'client',
    });
  });
});
