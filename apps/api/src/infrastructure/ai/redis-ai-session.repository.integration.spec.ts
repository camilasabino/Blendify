import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { EMPTY_AI_PRESERVATION } from '@/domain/ai/ai-intent-patch';
import {
  AI_SESSION_RECORD_VERSION,
  type AiSession,
  type AiSessionDestination,
} from '@/domain/ai/ai-session';
import { RedisCacheService } from '@/infrastructure/cache/redis-cache.service';
import { RedisConnection } from '@/infrastructure/cache/redis-connection';
import { ApplyAiRefinementUseCase } from '@/application/use-cases/apply-ai-refinement.use-case';
import { DismissAiRefinementUseCase } from '@/application/use-cases/dismiss-ai-refinement.use-case';
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

const TRACK = {
  id: '6LgJvl0Xdtc73RJ1mmpotq',
  name: 'Provider song',
  artistId: '4Z8W4fKeB5YxbusRsdQVPb',
  artistName: 'Radiohead',
  durationMs: 215_000,
  popularity: 61,
  uri: 'spotify:track:6LgJvl0Xdtc73RJ1mmpotq',
};
const RESULT = {
  playlist: {
    name: 'Blendify · Mix · Radiohead',
    description: '',
    seeds: [
      {
        type: 'artist' as const,
        id: '4Z8W4fKeB5YxbusRsdQVPb',
        name: 'Radiohead',
      },
    ],
    tracks: [TRACK],
  },
  recipe: {
    version: 1 as const,
    kind: 'artist_mix' as const,
    tracksPerSeed: 1,
    seeds: [{ id: '4Z8W4fKeB5YxbusRsdQVPb', name: 'Radiohead' }],
    popularity: 'balanced' as const,
    orderMode: 'random' as const,
  },
  durationMs: 215_000,
  unmetConstraints: [],
};

function withPendingCandidate(base: AiSession): AiSession {
  const candidateTrack = { ...TRACK, id: '3SVAN3BRByDmHOhKyIDxfC' };
  return {
    ...base,
    execution: {
      status: 'generated',
      startedAt: base.createdAt,
      completedAt: base.createdAt,
      result: RESULT,
    },
    pendingRefinement: {
      id: 'refinement-1',
      status: 'proposed',
      promptVersion: 'refinement-v2',
      proposedAt: base.updatedAt,
      aiSafe: {
        intent: {
          kind: 'artist_mix',
          artists: ['Radiohead'],
          genres: [],
          seedTracks: [],
          targetTrackCount: null,
          targetDurationMinutes: null,
          mood: null,
          popularity: 'rarities',
          orderMode: null,
          excludeArtists: [],
          excludeTracks: [],
          unsupportedConstraints: [],
        },
        preservation: EMPTY_AI_PRESERVATION,
        notApplied: [],
      },
      candidate: {
        status: 'ready',
        result: {
          ...RESULT,
          playlist: { ...RESULT.playlist, tracks: [candidateTrack] },
        },
        preservedPositions: [],
        diff: {
          tracks: {
            added: [{ trackId: candidateTrack.id, position: 1 }],
            removed: [{ trackId: TRACK.id, position: 1 }],
            moved: [],
            retainedCount: 0,
            replacedCount: 1,
            before: { trackCount: 1, durationMs: 215_000 },
            after: { trackCount: 1, durationMs: 215_000 },
          },
          intent: [{ field: 'popularity', from: 'balanced', to: 'rarities' }],
        },
      },
    },
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
    it('persists a pending candidate next to the unchanged applied preview and restores both', async () => {
      const token = randomUUID();
      const pending = withPendingCandidate(session(null));

      await repository.save(token, pending, 60_000);
      const restored = await repository.find(token);

      expect(restored).toEqual(pending);
      expect(restored?.execution).toEqual(pending.execution);
      expect(
        restored?.pendingRefinement?.status === 'proposed' &&
          restored.pendingRefinement.candidate,
      ).toEqual(
        pending.pendingRefinement?.status === 'proposed' &&
          pending.pendingRefinement.candidate,
      );
    });

    it('lets a newer refinement take over an expired lease while the stale attempt can neither write its candidate nor release the newer lease', async () => {
      const token = randomUUID();
      const read = { ...session(null), refinementAttempts: 1 };
      await repository.save(token, read, 60_000);
      const stale = await repository.acquireRefinementLock(token, 50);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const newer = await repository.acquireRefinementLock(token, 5_000);
      expect(newer).not.toBeNull();
      const reserved = {
        ...read,
        refinementAttempts: 2,
        updatedAt: new Date(Date.parse(read.updatedAt) + 1).toISOString(),
      };
      await expect(
        repository.saveIfUnchanged(token, reserved, read.updatedAt, 60_000),
      ).resolves.toBe(true);

      await expect(
        repository.renewRefinementLock(token, stale ?? '', 5_000),
      ).resolves.toBe(false);
      await expect(
        repository.saveIfUnchanged(
          token,
          withPendingCandidate(read),
          read.updatedAt,
          60_000,
        ),
      ).resolves.toBe(false);
      await repository.releaseRefinementLock(token, stale ?? '');
      await expect(
        repository.acquireRefinementLock(token, 5_000),
      ).resolves.toBeNull();
      await expect(repository.find(token)).resolves.toEqual(reserved);

      const settled = withPendingCandidate(reserved);
      await expect(
        repository.saveIfUnchanged(token, settled, reserved.updatedAt, 60_000),
      ).resolves.toBe(true);
      await expect(repository.find(token)).resolves.toEqual(settled);
      await repository.releaseRefinementLock(token, newer ?? '');
    });
    describe('settling a pending refinement', () => {
      const command = (token: string, refinementId = 'refinement-1') => ({
        token,
        userId: 'user-1',
        refinementId,
      });

      function sessionTtlMs(token: string): Promise<number> {
        const digest = createHash('sha256').update(token).digest('hex');
        const client = connection.readyClient();
        if (!client) {
          throw new Error('Redis is not ready');
        }
        return client.pttl(`blendify:ai:session:${digest}`);
      }

      function candidateOf(stored: AiSession) {
        const pending = stored.pendingRefinement;
        if (
          pending?.status !== 'proposed' ||
          pending.candidate.status !== 'ready'
        ) {
          throw new Error('Expected a ready pending candidate');
        }
        return { ...pending, result: pending.candidate.result };
      }

      it('applies a persisted candidate in one write, keeps the TTL bounded and restores it', async () => {
        const token = randomUUID();
        const pending = withPendingCandidate(session(null));
        const candidate = candidateOf(pending);
        await repository.save(token, pending, 60_000);

        await new ApplyAiRefinementUseCase(repository).execute(command(token));

        const restored = await repository.find(token);
        expect(restored).toMatchObject({
          aiSafe: {
            intent: candidate.aiSafe.intent,
            preservation: candidate.aiSafe.preservation,
          },
          execution: { status: 'generated', result: candidate.result },
          pendingRefinement: null,
          destination: null,
          originalPrompt: pending.originalPrompt,
          refinementAttempts: pending.refinementAttempts,
          expiresAt: pending.expiresAt,
        });
        const ttl = await sessionTtlMs(token);
        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(
          Date.parse(pending.expiresAt) - Date.now() + 1_000,
        );
      });

      it('dismisses a persisted candidate and restores the unchanged current playlist', async () => {
        const token = randomUUID();
        const pending = withPendingCandidate(session(null));
        await repository.save(token, pending, 60_000);

        await new DismissAiRefinementUseCase(repository).execute(
          command(token),
        );

        const restored = await repository.find(token);
        expect(restored).toMatchObject({
          aiSafe: pending.aiSafe,
          execution: pending.execution,
          pendingRefinement: null,
        });
        expect(await sessionTtlMs(token)).toBeGreaterThan(0);
      });

      it('rejects a stale refinement id and leaves the newer pending refinement untouched', async () => {
        const token = randomUUID();
        const base = withPendingCandidate(session(null));
        const newer: AiSession = {
          ...base,
          pendingRefinement: {
            ...(base.pendingRefinement as NonNullable<
              AiSession['pendingRefinement']
            >),
            id: 'refinement-2',
          },
        };
        await repository.save(token, newer, 60_000);

        for (const useCase of [
          new ApplyAiRefinementUseCase(repository),
          new DismissAiRefinementUseCase(repository),
        ]) {
          await expect(useCase.execute(command(token))).rejects.toMatchObject({
            code: 'AI_REFINEMENT_STALE',
          });
        }
        await expect(repository.find(token)).resolves.toEqual(newer);
      });

      it('lets exactly one of a racing apply and dismiss settle the candidate', async () => {
        const token = randomUUID();
        const pending = withPendingCandidate(session(null));
        const candidate = candidateOf(pending);
        await repository.save(token, pending, 60_000);

        const outcomes = await Promise.allSettled([
          new ApplyAiRefinementUseCase(repository).execute(command(token)),
          new DismissAiRefinementUseCase(repository).execute(command(token)),
        ]);

        expect(
          outcomes.filter((outcome) => outcome.status === 'fulfilled'),
        ).toHaveLength(1);
        const restored = await repository.find(token);
        expect(restored?.pendingRefinement).toBeNull();
        const applied = outcomes[0].status === 'fulfilled';
        expect(restored?.execution).toEqual(
          applied
            ? expect.objectContaining({ result: candidate.result })
            : pending.execution,
        );
        expect(restored?.aiSafe.intent).toEqual(
          applied ? candidate.aiSafe.intent : pending.aiSafe.intent,
        );
      });
    });
  },
);
