import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  AI_SESSION_RECORD_VERSION,
  type AiSession,
} from '@/domain/ai/ai-session';
import type { AiSessionRepositoryPort } from '@/domain/repositories/ai-session.repository.port';
import { RedisCacheService } from '@/infrastructure/cache/redis-cache.service';

const AI_SESSION_KEY_PREFIX = 'blendify:ai:session';

@Injectable()
export class RedisAiSessionRepository implements AiSessionRepositoryPort {
  constructor(private readonly cache: RedisCacheService) {}

  async save(token: string, session: AiSession, ttlMs: number): Promise<void> {
    await this.cache.setJson(sessionKey(token), session, ttlMs);
  }

  async find(token: string): Promise<AiSession | null> {
    const session = await this.cache.getJson<AiSession>(sessionKey(token));

    if (session?.version !== AI_SESSION_RECORD_VERSION) {
      return null;
    }
    return session;
  }
}

function sessionKey(token: string): string {
  const digest = createHash('sha256').update(token).digest('hex');
  return `${AI_SESSION_KEY_PREFIX}:${digest}`;
}
