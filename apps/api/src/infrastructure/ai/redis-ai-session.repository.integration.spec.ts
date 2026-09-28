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
  },
);
