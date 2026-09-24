import type Redis from 'ioredis';
import type { RedisConnection } from '../cache/redis-connection';
import {
  RequestLimitStoreUnavailableError,
  type PermitAcquisition,
  type PermitRef,
  type PermitRequest,
  type RequestLimitStore,
  type WindowHit,
} from './request-limit.store';

const REDIS_NOW_MS = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
`;

export const HIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

export const ACQUIRE_SCRIPT = `${REDIS_NOW_MS}
local lease = tonumber(ARGV[4])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[2]) then return 1 end
if redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[3]) then return 2 end
redis.call('ZADD', KEYS[1], now + lease, ARGV[1])
redis.call('ZADD', KEYS[2], now + lease, ARGV[1])
redis.call('PEXPIRE', KEYS[1], lease)
redis.call('PEXPIRE', KEYS[2], lease)
return 0
`;

export const RENEW_SCRIPT = `${REDIS_NOW_MS}
local lease = tonumber(ARGV[2])
local clientScore = redis.call('ZSCORE', KEYS[1], ARGV[1])
local globalScore = redis.call('ZSCORE', KEYS[2], ARGV[1])
if not clientScore or not globalScore
  or tonumber(clientScore) <= now or tonumber(globalScore) <= now then
  redis.call('ZREM', KEYS[1], ARGV[1])
  redis.call('ZREM', KEYS[2], ARGV[1])
  return 0
end
redis.call('ZADD', KEYS[1], 'XX', now + lease, ARGV[1])
redis.call('ZADD', KEYS[2], 'XX', now + lease, ARGV[1])
redis.call('PEXPIRE', KEYS[1], lease)
redis.call('PEXPIRE', KEYS[2], lease)
return 1
`;

export class RedisRequestLimitStore implements RequestLimitStore {
  constructor(private readonly connection: RedisConnection) {}

  isAvailable(): boolean {
    return this.connection.isReady();
  }

  async hit(key: string, windowMs: number): Promise<WindowHit> {
    const [count, resetInMs] = (await this.run((client) =>
      client.eval(HIT_SCRIPT, 1, key, windowMs),
    )) as [number, number];
    return { count, resetInMs };
  }

  async acquire(request: PermitRequest): Promise<PermitAcquisition> {
    const result = (await this.run((client) =>
      client.eval(
        ACQUIRE_SCRIPT,
        2,
        request.clientKey,
        request.globalKey,
        request.permitId,
        request.clientLimit,
        request.globalLimit,
        request.leaseMs,
      ),
    )) as number;
    if (result === 0) return { acquired: true };
    return { acquired: false, scope: result === 1 ? 'client' : 'global' };
  }

  async renew(permit: PermitRef, leaseMs: number): Promise<boolean> {
    const result = (await this.run((client) =>
      client.eval(
        RENEW_SCRIPT,
        2,
        permit.clientKey,
        permit.globalKey,
        permit.permitId,
        leaseMs,
      ),
    )) as number;
    return result === 1;
  }

  async release(permit: PermitRef): Promise<void> {
    await this.run((client) =>
      client
        .multi()
        .zrem(permit.clientKey, permit.permitId)
        .zrem(permit.globalKey, permit.permitId)
        .exec(),
    );
  }

  private async run<T>(command: (client: Redis) => Promise<T>): Promise<T> {
    const client = this.connection.readyClient();
    if (!client) throw new RequestLimitStoreUnavailableError();
    try {
      return await command(client);
    } catch (error) {
      throw new RequestLimitStoreUnavailableError({ cause: error });
    }
  }
}
