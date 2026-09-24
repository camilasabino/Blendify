import { MemoryRequestLimitStore } from './memory-request-limit.store';

function permit(id: string, client = 'client:a') {
  return {
    permitId: id,
    clientKey: client,
    globalKey: 'global',
    clientLimit: 2,
    globalLimit: 3,
    leaseMs: 1_000,
  };
}

describe('MemoryRequestLimitStore', () => {
  let now: number;
  let store: MemoryRequestLimitStore;

  beforeEach(() => {
    now = 10_000;
    store = new MemoryRequestLimitStore(() => now);
  });

  describe('hit', () => {
    it('counts hits inside one window and reports the remaining time', async () => {
      await expect(store.hit('k', 60_000)).resolves.toEqual({
        count: 1,
        resetInMs: 60_000,
      });
      now += 15_000;
      await expect(store.hit('k', 60_000)).resolves.toEqual({
        count: 2,
        resetInMs: 45_000,
      });
    });

    it('resets the count when the window expires', async () => {
      await store.hit('k', 1_000);
      await store.hit('k', 1_000);
      now += 1_000;
      await expect(store.hit('k', 1_000)).resolves.toEqual({
        count: 1,
        resetInMs: 1_000,
      });
    });

    it('keeps independent keys apart', async () => {
      await store.hit('search:u:1', 1_000);
      await store.hit('search:u:1', 1_000);
      await expect(store.hit('resolve:u:1', 1_000)).resolves.toMatchObject({
        count: 1,
      });
    });
  });

  describe('permits', () => {
    it('acquires until the per-client cap', async () => {
      await expect(store.acquire(permit('p1'))).resolves.toEqual({
        acquired: true,
      });
      await expect(store.acquire(permit('p2'))).resolves.toEqual({
        acquired: true,
      });
      await expect(store.acquire(permit('p3'))).resolves.toEqual({
        acquired: false,
        scope: 'client',
      });
    });

    it('rejects on the global cap across clients', async () => {
      await store.acquire(permit('p1', 'client:a'));
      await store.acquire(permit('p2', 'client:b'));
      await store.acquire(permit('p3', 'client:c'));
      await expect(store.acquire(permit('p4', 'client:d'))).resolves.toEqual({
        acquired: false,
        scope: 'global',
      });
    });

    it('frees capacity on release and ignores repeated releases', async () => {
      await store.acquire(permit('p1'));
      await store.acquire(permit('p2'));
      await store.release(permit('p1'));
      await store.release(permit('p1'));
      await expect(store.acquire(permit('p3'))).resolves.toEqual({
        acquired: true,
      });
      await expect(store.acquire(permit('p4'))).resolves.toMatchObject({
        acquired: false,
      });
    });

    it('recovers abandoned permits after the lease expires', async () => {
      await store.acquire(permit('p1'));
      await store.acquire(permit('p2'));
      now += 1_000;
      await expect(store.acquire(permit('p3'))).resolves.toEqual({
        acquired: true,
      });
    });

    it('extends a live lease on renew', async () => {
      await store.acquire(permit('p1'));
      await store.acquire(permit('p2'));
      now += 900;
      await expect(store.renew(permit('p1'), 1_000)).resolves.toBe(true);
      now += 900;
      await expect(store.acquire(permit('p3'))).resolves.toEqual({
        acquired: true,
      });
      await expect(store.acquire(permit('p4'))).resolves.toEqual({
        acquired: false,
        scope: 'client',
      });
    });

    it('does not revive an expired or released permit', async () => {
      await store.acquire(permit('p1'));
      now += 1_000;
      await expect(store.renew(permit('p1'), 1_000)).resolves.toBe(false);
      await store.acquire(permit('p2'));
      await store.release(permit('p2'));
      await expect(store.renew(permit('p2'), 1_000)).resolves.toBe(false);
    });

    it('never exceeds the caps under concurrent acquisition', async () => {
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          store.acquire(permit(`p${i}`, `client:${i % 2}`)),
        ),
      );
      expect(results.filter((result) => result.acquired)).toHaveLength(3);
    });
  });
});
