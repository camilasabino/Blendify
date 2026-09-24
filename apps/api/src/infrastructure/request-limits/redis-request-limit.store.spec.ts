import type { RedisConnection } from '../cache/redis-connection';
import {
  ACQUIRE_SCRIPT,
  HIT_SCRIPT,
  RENEW_SCRIPT,
  RedisRequestLimitStore,
} from './redis-request-limit.store';
import { RequestLimitStoreUnavailableError } from './request-limit.store';

const ref = { permitId: 'p1', clientKey: 'c', globalKey: 'g' };

function setup(client: Record<string, jest.Mock> | null) {
  const connection = {
    isReady: () => client !== null,
    readyClient: () => client,
  } as unknown as RedisConnection;
  return new RedisRequestLimitStore(connection);
}

describe('RedisRequestLimitStore', () => {
  it('runs the hit script with the key and window', async () => {
    const evalMock = jest.fn().mockResolvedValue([3, 4_500]);
    const store = setup({ eval: evalMock });

    await expect(
      store.hit('blendify:rl:search:ip:1.2.3.4', 60_000),
    ).resolves.toEqual({ count: 3, resetInMs: 4_500 });
    expect(evalMock).toHaveBeenCalledWith(
      HIT_SCRIPT,
      1,
      'blendify:rl:search:ip:1.2.3.4',
      60_000,
    );
  });

  it('maps acquire results to acquisition scopes', async () => {
    const evalMock = jest
      .fn()
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const store = setup({ eval: evalMock });
    const request = { ...ref, clientLimit: 1, globalLimit: 5, leaseMs: 30_000 };

    await expect(store.acquire(request)).resolves.toEqual({ acquired: true });
    await expect(store.acquire(request)).resolves.toEqual({
      acquired: false,
      scope: 'client',
    });
    await expect(store.acquire(request)).resolves.toEqual({
      acquired: false,
      scope: 'global',
    });
    expect(evalMock).toHaveBeenCalledWith(
      ACQUIRE_SCRIPT,
      2,
      'c',
      'g',
      'p1',
      1,
      5,
      30_000,
    );
  });

  it('reports whether a renewal kept the permit', async () => {
    const evalMock = jest
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    const store = setup({ eval: evalMock });

    await expect(store.renew(ref, 30_000)).resolves.toBe(true);
    await expect(store.renew(ref, 30_000)).resolves.toBe(false);
    expect(evalMock).toHaveBeenCalledWith(
      RENEW_SCRIPT,
      2,
      'c',
      'g',
      'p1',
      30_000,
    );
  });

  it('releases from both sets in one transaction', async () => {
    const chain = {
      zrem: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };
    const store = setup({ multi: jest.fn(() => chain) });

    await store.release(ref);
    expect(chain.zrem).toHaveBeenNthCalledWith(1, 'c', 'p1');
    expect(chain.zrem).toHaveBeenNthCalledWith(2, 'g', 'p1');
    expect(chain.exec).toHaveBeenCalled();
  });

  it('reports unavailability when not connected or a command fails', async () => {
    await expect(setup(null).hit('k', 1_000)).rejects.toBeInstanceOf(
      RequestLimitStoreUnavailableError,
    );
    const failing = setup({
      eval: jest.fn().mockRejectedValue(new Error('Command timed out')),
    });
    await expect(failing.hit('k', 1_000)).rejects.toBeInstanceOf(
      RequestLimitStoreUnavailableError,
    );
  });
});
