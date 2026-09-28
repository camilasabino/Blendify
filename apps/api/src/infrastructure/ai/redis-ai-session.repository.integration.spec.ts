import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { EMPTY_AI_PRESERVATION } from '@/domain/ai/ai-intent-patch';
import {
  AI_SESSION_RECORD_VERSION,
  type AiSession,
  type AiSessionDestination,
} from '@/domain/ai/ai-session';
import { RedisCacheService } from '@/infrastructure/cache/redis-cache.service';
import { RedisConnection } from '@/infrastructure/cache/redis-connection';
import { RedisAiSessionRepository } from './redis-ai-session.repository';

const redisUrl = process.env.REDIS_TEST_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

function session(destination: AiSessionDestination | null): AiSession {
  const now = new Date();
  return {
    version: AI_SESSION_RECORD_VERSION,
    ownerUserId: 'user-1',
    originalPrompt: 'Radiohead deep cuts',
    promptVersion: 'intent-v3',
    aiSafe: { intent: null, preservation: EMPTY_AI_PRESERVATION },
    clarification: null,
    execution: null,
    destination,
    refinementAttempts: 0,
    pendingRefinement: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
  };
}

function publishing(attemptId: string): AiSessionDestination {
  return {
    status: 'publishing',
    attemptId,
    startedAt: new Date().toISOString(),
    spotifyPlaylist: null,
  };
}

describeWithRedis(
  'RedisAiSessionRepository destination lease against real Redis',
  () => {
    let connection: RedisConnection;
    let repository: RedisAiSessionRepository;

    beforeAll(async () => {
      connection = new RedisConnection({
        get: () => redisUrl,
      } as unknown as ConfigService);
      await connection.onModuleInit();
      repository = new RedisAiSessionRepository(
        new RedisCacheService(connection),
      );
    });

    afterAll(async () => {
      await connection.onModuleDestroy();
    });

    it('lets a newer owner take over an expired lease without the stale owner releasing it or overwriting its outcome', async () => {
      const token = randomUUID();
      const stale = await repository.acquireDestinationClaim(token, 50);
      await repository.save(token, session(publishing('attempt-a')), 60_000);
      await new Promise((resolve) => setTimeout(resolve, 100));

      await expect(repository.hasDestinationClaim(token)).resolves.toBe(false);
      const newer = await repository.acquireDestinationClaim(token, 5_000);
      const interrupted = session({
        status: 'publish_incomplete',
        failedAt: new Date().toISOString(),
        spotifyPlaylist: null,
      });
      await expect(
        repository.savePublishOutcome(token, interrupted, 'attempt-a', 60_000),
      ).resolves.toBe(true);

      await expect(
        repository.renewDestinationClaim(token, stale ?? '', 5_000),
      ).resolves.toBe(false);
      await repository.releaseDestinationClaim(token, stale ?? '');
      await expect(repository.hasDestinationClaim(token)).resolves.toBe(true);
      await expect(
        repository.savePublishOutcome(
          token,
          session({
            status: 'published',
            publishedAt: new Date().toISOString(),
            spotifyPlaylist: { spotifyId: 'p1', spotifyUrl: null },
            savedToLibrary: true,
          }),
          'attempt-a',
          60_000,
        ),
      ).resolves.toBe(false);
      await expect(repository.find(token)).resolves.toEqual(interrupted);

      await repository.releaseDestinationClaim(token, newer ?? '');
      await expect(repository.hasDestinationClaim(token)).resolves.toBe(false);
    });

    it('fences a refinement write on the session version it read', async () => {
      const token = randomUUID();
      const read = session(null);
      await repository.save(token, read, 60_000);
      const concurrent = {
        ...session(publishing('attempt-b')),
        updatedAt: new Date(Date.parse(read.updatedAt) + 1).toISOString(),
      };
      await repository.save(token, concurrent, 60_000);

      await expect(
        repository.saveIfUnchanged(
          token,
          { ...read, refinementAttempts: 1 },
          read.updatedAt,
          60_000,
        ),
      ).resolves.toBe(false);
      await expect(repository.find(token)).resolves.toEqual(concurrent);
      await expect(
        repository.saveIfUnchanged(
          token,
          { ...concurrent, refinementAttempts: 1 },
          concurrent.updatedAt,
          60_000,
        ),
      ).resolves.toBe(true);
    });

    it('allows one refinement lease per session and only its owner releases it', async () => {
      const token = randomUUID();
      const owner = await repository.acquireRefinementLock(token, 5_000);

      await expect(
        repository.acquireRefinementLock(token, 5_000),
      ).resolves.toBeNull();
      await repository.releaseRefinementLock(token, 'someone-else');
      await expect(
        repository.acquireRefinementLock(token, 5_000),
      ).resolves.toBeNull();
      await repository.releaseRefinementLock(token, owner ?? '');
      await expect(
        repository.acquireRefinementLock(token, 5_000),
      ).resolves.not.toBeNull();
    });
  },
);
