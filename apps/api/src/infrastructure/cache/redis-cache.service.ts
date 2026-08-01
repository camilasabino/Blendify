import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * JSON cache backed by Redis (AOF-persisted via docker-compose).
 * Falls back to process memory if Redis is unreachable so local tests
 * and brief outages do not break the API.
 */
@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly url: string;
  private client: Redis | null = null;
  private ready = false;
  private readonly memory = new Map<
    string,
    { value: string; expiresAt: number }
  >();

  constructor(config: ConfigService) {
    this.url =
      config.get<string>('REDIS_URL')?.trim() || 'redis://localhost:6379';
  }

  async onModuleInit(): Promise<void> {
    const redis = new Redis(this.url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      enableReadyCheck: true,
      connectTimeout: 2_000,
      retryStrategy: () => null,
    });

    redis.on('error', (error) => {
      if (this.ready) {
        this.logger.warn(`Redis error: ${error.message}`);
      }
      this.ready = false;
    });
    redis.on('ready', () => {
      this.ready = true;
      this.logger.log(`Redis cache connected (${sanitizeRedisUrl(this.url)})`);
    });
    redis.on('end', () => {
      this.ready = false;
    });

    this.client = redis;
    try {
      await redis.connect();
      await redis.ping();
      this.ready = true;
    } catch (error) {
      this.ready = false;
      redis.disconnect();
      this.client = null;
      this.logger.warn(
        `Redis unavailable at ${sanitizeRedisUrl(this.url)} — using in-memory cache fallback (${
          error instanceof Error ? error.message : String(error)
        })`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) return;
    const client = this.client;
    this.client = null;
    this.ready = false;
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    try {
      if (this.ready && this.client) {
        const raw = await this.client.get(key);
        if (raw == null) return null;
        return JSON.parse(raw) as T;
      }
    } catch (error) {
      this.logger.warn(
        `Redis get failed for ${key}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.ready = false;
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

    try {
      if (this.ready && this.client) {
        await this.client.set(key, encoded, 'EX', ttlSec);
        return;
      }
    } catch (error) {
      this.logger.warn(
        `Redis set failed for ${key}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.ready = false;
    }

    this.memory.set(key, {
      value: encoded,
      expiresAt: Date.now() + ttlMs,
    });
  }
}

/** Avoid logging Redis passwords embedded in connection URLs. */
export function sanitizeRedisUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.password) url.password = '***';
    if (url.username) url.username = url.username ? '***' : '';
    return url.toString();
  } catch {
    return 'redis://***';
  }
}
