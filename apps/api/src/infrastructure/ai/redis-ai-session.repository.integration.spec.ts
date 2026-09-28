import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
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
    aiSafe: { intent: null },
    clarification: null,
    execution: null,
    destination,
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
  },
);
