import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const COMMAND_TIMEOUT_MS = 500;
const CONNECT_TIMEOUT_MS = 2_000;
const MAX_RECONNECT_DELAY_MS = 2_000;

@Injectable()
export class RedisConnection implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisConnection.name);
  private readonly url: string;
  private client: Redis | null = null;
  private ready = false;

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
      connectTimeout: CONNECT_TIMEOUT_MS,
      commandTimeout: COMMAND_TIMEOUT_MS,
      retryStrategy: (times) => Math.min(times * 200, MAX_RECONNECT_DELAY_MS),
    });

    redis.on('error', (error) => {
      if (this.ready) {
        this.logger.warn(`Redis error: ${error.message}`);
      }
      this.ready = false;
    });
    redis.on('ready', () => {
      this.ready = true;
      this.logger.log(`Redis connected (${sanitizeRedisUrl(this.url)})`);
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
      this.logger.warn(
        `Redis unavailable at ${sanitizeRedisUrl(this.url)}; reconnecting in the background (${
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

  isReady(): boolean {
    return this.ready && this.client !== null;
  }

  readyClient(): Redis | null {
    return this.isReady() ? this.client : null;
  }
}

export function sanitizeRedisUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.password) url.password = '***';
    if (url.username) url.username = '***';
    return url.toString();
  } catch {
    return 'redis://***';
  }
}
