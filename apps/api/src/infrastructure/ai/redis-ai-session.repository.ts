import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  AI_SESSION_RECORD_VERSION,
  type AiSession,
} from '@/domain/ai/ai-session';
import type { AiSessionRepositoryPort } from '@/domain/repositories/ai-session.repository.port';
import { RedisCacheService } from '@/infrastructure/cache/redis-cache.service';

const AI_SESSION_KEY_PREFIX = 'blendify:ai:session';
const AI_GENERATION_LOCK_KEY_PREFIX = 'blendify:ai:generation-lock';

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

  saveGenerationOutcome(
    token: string,
    session: AiSession,
    attemptId: string,
    ttlMs: number,
  ): Promise<boolean> {
    return this.cache.setJsonIfFields(sessionKey(token), session, ttlMs, {
      'execution.status': 'generating',
      'execution.attemptId': attemptId,
    });
  }

  async acquireGenerationLock(
    token: string,
    ttlMs: number,
  ): Promise<string | null> {
    const leaseId = randomUUID();
    const acquired = await this.cache.setIfAbsent(
      generationLockKey(token),
      leaseId,
      ttlMs,
    );
    return acquired ? leaseId : null;
  }

  renewGenerationLock(
    token: string,
    leaseId: string,
    ttlMs: number,
  ): Promise<boolean> {
    return this.cache.renewIfValue(generationLockKey(token), leaseId, ttlMs);
  }

  releaseGenerationLock(token: string, leaseId: string): Promise<void> {
    return this.cache.deleteIfValue(generationLockKey(token), leaseId);
  }

  hasGenerationLock(token: string): Promise<boolean> {
    return this.cache.exists(generationLockKey(token));
  }
}

function sessionKey(token: string): string {
  return `${AI_SESSION_KEY_PREFIX}:${tokenDigest(token)}`;
}

function generationLockKey(token: string): string {
  return `${AI_GENERATION_LOCK_KEY_PREFIX}:${tokenDigest(token)}`;
}

function tokenDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
