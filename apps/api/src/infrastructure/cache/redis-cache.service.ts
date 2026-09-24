import { Injectable, Logger } from '@nestjs/common';
import { RedisConnection } from './redis-connection';

export { sanitizeRedisUrl } from './redis-connection';

/**
 * JSON cache backed by Redis (AOF-persisted via docker-compose).
 * Falls back to process memory if Redis is unreachable so local tests
 * and brief outages do not break the API.
 */
@Injectable()
export class RedisCacheService {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly memory = new Map<
    string,
    { value: string; expiresAt: number }
  >();

  constructor(private readonly connection: RedisConnection) {}

  async getJson<T>(key: string): Promise<T | null> {
    const client = this.connection.readyClient();
    try {
      if (client) {
        const raw = await client.get(key);
        if (raw == null) return null;
        return JSON.parse(raw) as T;
      }
    } catch (error) {
      this.logger.warn(
        `Redis get failed for ${key}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const cached = this.memory.get(key);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }
    try {
      return JSON.parse(cached.value) as T;
    } catch {
      this.memory.delete(key);
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlMs: number): Promise<void> {
    const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
    const encoded = JSON.stringify(value);
    const client = this.connection.readyClient();

    try {
      if (client) {
        await client.set(key, encoded, 'EX', ttlSec);
        return;
      }
    } catch (error) {
      this.logger.warn(
        `Redis set failed for ${key}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    this.memory.set(key, {
      value: encoded,
      expiresAt: Date.now() + ttlMs,
    });
  }
}
