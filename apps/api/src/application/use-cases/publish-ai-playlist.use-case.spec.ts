import type { PlaylistDetail } from '@blendify/contracts';
import { EMPTY_AI_PRESERVATION } from '@/domain/ai/ai-intent-patch';
import {
  AI_SESSION_RECORD_VERSION,
  type AiPendingRefinement,
  type AiSession,
  type AiSessionDestination,
} from '@/domain/ai/ai-session';
import { AiSessionError } from '@/domain/errors/ai-session.error';
import type { AiSessionRepositoryPort } from '@/domain/repositories/ai-session.repository.port';
import type { MusicProviderPort } from '@/domain/repositories/music-provider.port';
import type { UsageStatsRepositoryPort } from '@/domain/repositories/usage-stats.repository.port';
import type { UserRepositoryPort } from '@/domain/repositories/user.repository.port';
import { User } from '@/domain/user/user.entity';
import type { ProviderPlaylist } from '@/domain/repositories/music-provider.port';
import { toAiSessionStateResponse } from '@/application/dto/ai-generation-response.dto';
import {
  DESTINATION_LEASE_MS,
  DESTINATION_LEASE_RENEW_INTERVAL_MS,
} from '@/application/services/destination-lease.policy';
import type { PublishPlaylistService } from '@/application/services/publish-playlist.service';
import { PublishAiPlaylistUseCase } from './publish-ai-playlist.use-case';

const TOKEN = 'session-token';

function generatedSession(
  destination: AiSessionDestination | null = null,
): AiSession {
  const now = new Date();
  return {
    version: AI_SESSION_RECORD_VERSION,
    ownerUserId: 'user-1',
    originalPrompt: 'Radiohead deep cuts',
    promptVersion: 'intent-v3',
    aiSafe: { intent: null, preservation: EMPTY_AI_PRESERVATION },
    clarification: null,
    execution: {
      status: 'generated',
      startedAt: now.toISOString(),
      completedAt: now.toISOString(),
      result: {
        playlist: {
          name: 'Blendify · Radiohead',
          description: 'Made with Blendify.',
          seeds: [{ type: 'artist', id: 'radiohead-id', name: 'Radiohead' }],
          tracks: [
            {
              id: 'r1',
              name: 'Reckoner',
              artistId: 'radiohead-id',
              artistName: 'Radiohead',
              durationMs: 290_000,
              popularity: 60,
              uri: 'spotify:track:r1',
            },
          ],
        },
        recipe: {
          version: 1,
          kind: 'artist_mix',
          tracksPerSeed: 1,
          seeds: [{ id: 'radiohead-id', name: 'Radiohead' }],
          popularity: 'balanced',
          orderMode: 'random',
        },
        durationMs: 290_000,
        unmetConstraints: [],
      },
    },
    destination,
    refinementAttempts: 0,
    pendingRefinement: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 20 * 60_000).toISOString(),
  };
}

type PublishInput = Parameters<PublishPlaylistService['execute']>[0];

interface PendingPublish {
  input: PublishInput;
  createRemote: (remote?: ProviderPlaylist) => Promise<void>;
  succeed: () => void;
  fail: (error: Error) => void;
}

function setup(initial: AiSession) {
  let stored = initial;
  const claims = new Map<string, { id: string; expiresAt: number }>();
  let nextClaim = 0;
  const liveClaim = (token: string) => {
    const claim = claims.get(token);
    if (claim && claim.expiresAt <= Date.now()) {
      claims.delete(token);
      return undefined;
    }
    return claim;
  };
  const sessions = {
    find: jest.fn(() => Promise.resolve(stored)),
    save: jest.fn((_token: string, next: AiSession) => {
      stored = next;
      return Promise.resolve();
    }),
    saveIfUnchanged: jest.fn(
      (_token: string, next: AiSession, expectedUpdatedAt: string) => {
        if (stored.updatedAt !== expectedUpdatedAt) {
          return Promise.resolve(false);
        }
        stored = next;
        return Promise.resolve(true);
      },
    ),
    savePublishOutcome: jest.fn(
      (_token: string, next: AiSession, attemptId: string) => {
        const current = stored.destination;
        if (
          current?.status !== 'publishing' ||
          current.attemptId !== attemptId
        ) {
          return Promise.resolve(false);
        }
        stored = next;
        return Promise.resolve(true);
      },
    ),
    acquireDestinationClaim: jest.fn((token: string, ttlMs: number) => {
      if (liveClaim(token)) {
        return Promise.resolve(null);
      }
      nextClaim += 1;
      const id = `claim-${nextClaim}`;
      claims.set(token, { id, expiresAt: Date.now() + ttlMs });
      return Promise.resolve<string | null>(id);
    }),
    renewDestinationClaim: jest.fn(
      (token: string, claimId: string, ttlMs: number) => {
        const claim = liveClaim(token);
        if (claim?.id !== claimId) {
          return Promise.resolve(false);
        }
        claim.expiresAt = Date.now() + ttlMs;
        return Promise.resolve(true);
      },
    ),
    releaseDestinationClaim: jest.fn((token: string, claimId: string) => {
      if (liveClaim(token)?.id === claimId) {
        claims.delete(token);
      }
      return Promise.resolve();
    }),
    hasDestinationClaim: jest.fn((token: string) =>
      Promise.resolve(liveClaim(token) !== undefined),
    ),
  };
  const pending: PendingPublish[] = [];
  const publish = jest.fn(
    (input: PublishInput) =>
      new Promise<PlaylistDetail>((resolve, reject) => {
        pending.push({
          input,
          createRemote: (remote = { id: 'p1', url: 'https://sp/p1' }) =>
            input.onRemotePlaylistCreated?.(remote) ?? Promise.resolve(),
          succeed: () =>
            resolve({
              spotifyId: 'p1',
              spotifyUrl: 'https://sp/p1',
            } as PlaylistDetail),
          fail: reject,
        });
      }),
  );
  const useCase = new PublishAiPlaylistUseCase(
    sessions as unknown as AiSessionRepositoryPort,
    {
      findById: () =>
        Promise.resolve(
          User.create({
            id: 'user-1',
            spotifyId: 'spotify-user-1',
            displayName: 'Listener',
          }),
        ),
    } as unknown as UserRepositoryPort,
    { forUser: () => ({}) as MusicProviderPort },
    {
      recordMix: jest.fn(() => Promise.resolve()),
    } as unknown as UsageStatsRepositoryPort,
    { execute: publish } as unknown as PublishPlaylistService,
  );
  return {
    useCase,
    sessions,
    publish,
    pending,
    claims,
    stored: () => stored,
    replace: (next: AiSession) => {
      stored = next;
    },
    loseClaim: () => claims.delete(TOKEN),
  };
}

const COMMAND = {
  token: TOKEN,
  userId: 'user-1',
  name: 'Edited',
  persistToLibrary: true,
};

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function publicDestination(session: AiSession) {
  return toAiSessionStateResponse(TOKEN, session, { transferEnabled: false })
    .destination;
}

describe('PublishAiPlaylistUseCase', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects a concurrent publish while the first one is still creating the playlist', async () => {
    const world = setup(generatedSession());

    const first = world.useCase.execute(COMMAND);
    await flush();
    await world.pending[0].createRemote();

    expect(world.stored().destination).toMatchObject({
      status: 'publishing',
      spotifyPlaylist: { spotifyId: 'p1', spotifyUrl: 'https://sp/p1' },
    });
    await expect(world.useCase.execute(COMMAND)).rejects.toEqual(
      AiSessionError.destinationInProgress(),
    );

    world.pending[0].succeed();
    await expect(first).resolves.toMatchObject({
      session: { destination: { status: 'published' } },
    });
    expect(world.publish).toHaveBeenCalledTimes(1);
    expect(world.claims.has(TOKEN)).toBe(false);
  });

  it('keeps a healthy publish authoritative well beyond any fixed timer by renewing its lease', async () => {
    const world = setup(generatedSession());

    const first = world.useCase.execute(COMMAND);
    await flush();
    await world.pending[0].createRemote();

    await jest.advanceTimersByTimeAsync(
      DESTINATION_LEASE_RENEW_INTERVAL_MS - 1,
    );
    expect(world.sessions.renewDestinationClaim).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(world.sessions.renewDestinationClaim).toHaveBeenCalledWith(
      TOKEN,
      'claim-1',
      DESTINATION_LEASE_MS,
    );

    await jest.advanceTimersByTimeAsync(10 * 60_000);
    expect(await world.sessions.hasDestinationClaim(TOKEN)).toBe(true);
    expect(publicDestination(world.stored())).toEqual({
      status: 'publishing',
    });
    await expect(world.useCase.execute(COMMAND)).rejects.toEqual(
      AiSessionError.destinationInProgress(),
    );

    world.pending[0].succeed();
    await expect(first).resolves.toMatchObject({
      session: { destination: { status: 'published' } },
    });
    expect(world.publish).toHaveBeenCalledTimes(1);
  });

  it('lets the lease of a dead process expire and settles that publish as incomplete without republishing', async () => {
    const world = setup(
      generatedSession({
        status: 'publishing',
        attemptId: 'attempt-dead',
        startedAt: new Date().toISOString(),
        spotifyPlaylist: { spotifyId: 'p0', spotifyUrl: 'https://sp/p0' },
      }),
    );
    await world.sessions.acquireDestinationClaim(TOKEN, DESTINATION_LEASE_MS);

    await jest.advanceTimersByTimeAsync(DESTINATION_LEASE_MS - 1);
    await expect(world.useCase.execute(COMMAND)).rejects.toEqual(
      AiSessionError.destinationInProgress(),
    );
    await jest.advanceTimersByTimeAsync(1);

    const { session } = await world.useCase.execute(COMMAND);

    expect(publicDestination(session)).toEqual({
      status: 'publish_incomplete',
      spotifyUrl: 'https://sp/p0',
    });
    expect(world.stored()).toBe(session);
    expect(world.publish).not.toHaveBeenCalled();
    expect(world.claims.has(TOKEN)).toBe(false);
  });

  describe('a publisher that lost its lease', () => {
    async function supersede(world: ReturnType<typeof setup>) {
      const stale = world.useCase.execute(COMMAND);
      await flush();
      await world.pending[0].createRemote();
      world.loseClaim();
      await jest.advanceTimersByTimeAsync(DESTINATION_LEASE_RENEW_INTERVAL_MS);

      const newer = await world.useCase.execute(COMMAND);
      expect(newer.session.destination).toMatchObject({
        status: 'publish_incomplete',
      });
      return { stale, newer };
    }

    it('cannot overwrite the newer destination with a late success', async () => {
      const world = setup(generatedSession());
      const { stale, newer } = await supersede(world);

      world.pending[0].succeed();

      await expect(stale).resolves.toMatchObject({
        session: { destination: { status: 'publish_incomplete' } },
      });
      expect(world.stored()).toBe(newer.session);
      expect(world.publish).toHaveBeenCalledTimes(1);
    });

    it('cannot overwrite the newer destination with a late failure', async () => {
      const world = setup(generatedSession());
      const { stale, newer } = await supersede(world);

      world.pending[0].fail(new Error('Spotify addTracks failed (502)'));

      await expect(stale).resolves.toMatchObject({
        session: { destination: { status: 'publish_incomplete' } },
      });
      expect(world.stored()).toBe(newer.session);
      expect(world.publish).toHaveBeenCalledTimes(1);
    });

    it('cannot restore the previous destination over a newer one after a clean early failure', async () => {
      const world = setup(generatedSession());
      const stale = world.useCase.execute(COMMAND);
      await flush();
      world.loseClaim();
      await jest.advanceTimersByTimeAsync(DESTINATION_LEASE_RENEW_INTERVAL_MS);
      const newer = await world.useCase.execute(COMMAND);

      world.pending[0].fail(new Error('Spotify createPlaylist failed (400)'));

      await expect(stale).rejects.toThrow('createPlaylist failed');
      expect(world.stored()).toBe(newer.session);
      expect(world.stored().destination).toMatchObject({
        status: 'publish_incomplete',
        spotifyPlaylist: null,
      });
    });

    it('cannot release the claim held by the newer owner', async () => {
      const world = setup(generatedSession());
      const stale = world.useCase.execute(COMMAND);
      await flush();
      world.loseClaim();
      await jest.advanceTimersByTimeAsync(DESTINATION_LEASE_RENEW_INTERVAL_MS);
      const newerClaim = await world.sessions.acquireDestinationClaim(
        TOKEN,
        DESTINATION_LEASE_MS,
      );

      world.pending[0].succeed();
      await stale;

      expect(world.claims.get(TOKEN)?.id).toBe(newerClaim);
    });
  });

  it('returns a successful publish from the session on replay without calling Spotify', async () => {
    const world = setup(generatedSession());
    const first = world.useCase.execute(COMMAND);
    await flush();
    world.pending[0].succeed();
    const published = await first;

    const replay = await world.useCase.execute({ ...COMMAND, name: 'Other' });

    expect(replay.session).toBe(published.session);
    expect(world.publish).toHaveBeenCalledTimes(1);
    expect(world.sessions.acquireDestinationClaim).toHaveBeenCalledTimes(1);
  });

  it('never retries an incomplete publish on its own or on a repeated request', async () => {
    const world = setup(generatedSession());
    const first = world.useCase.execute(COMMAND);
    await flush();
    await world.pending[0].createRemote();
    world.pending[0].fail(new Error('Spotify addTracks failed (502)'));
    const incomplete = await first;

    await jest.advanceTimersByTimeAsync(10 * DESTINATION_LEASE_MS);
    const replay = await world.useCase.execute(COMMAND);

    expect(publicDestination(incomplete.session)).toEqual({
      status: 'publish_incomplete',
      spotifyUrl: 'https://sp/p1',
    });
    expect(replay.session).toBe(incomplete.session);
    expect(world.publish).toHaveBeenCalledTimes(1);
  });

  it('frees the destination after a clean failure before any playlist exists', async () => {
    const world = setup(generatedSession());
    const first = world.useCase.execute(COMMAND);
    await flush();
    world.pending[0].fail(new Error('Spotify createPlaylist failed (400)'));

    await expect(first).rejects.toThrow('createPlaylist failed');
    expect(world.stored().destination).toBeNull();
    expect(world.claims.has(TOKEN)).toBe(false);
  });
  describe('while a refinement is pending', () => {
    const PENDING: AiPendingRefinement[] = [
      {
        id: 'refinement-1',
        status: 'proposed',
        promptVersion: 'refinement-v2',
        proposedAt: new Date().toISOString(),
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
          status: 'failed',
          failure: {
            code: 'CATALOG_UNAVAILABLE',
            category: 'provider_unavailable',
            retryAfterSeconds: null,
            seedNotFound: null,
          },
        },
      },
      {
        id: 'refinement-2',
        status: 'needs_clarification',
        promptVersion: 'refinement-v2',
        proposedAt: new Date().toISOString(),
        clarification: {
          reason: 'conflicting_changes',
          seedType: null,
          limit: null,
          names: [],
          unsupportedConstraints: [],
        },
      },
      {
        id: 'refinement-3',
        status: 'unchanged',
        promptVersion: 'refinement-v2',
        proposedAt: new Date().toISOString(),
      },
    ];

    it.each(PENDING.map((pending) => [pending.status, pending] as const))(
      'refuses to publish a session with a %s refinement without claiming or calling Spotify',
      async (_status, pendingRefinement) => {
        const world = setup({ ...generatedSession(), pendingRefinement });

        await expect(world.useCase.execute(COMMAND)).rejects.toMatchObject({
          code: 'AI_REFINEMENT_PENDING',
        });
        expect(world.sessions.acquireDestinationClaim).not.toHaveBeenCalled();
        expect(world.publish).not.toHaveBeenCalled();
        expect(world.stored().destination).toBeNull();
        expect(world.stored().pendingRefinement).toBe(pendingRefinement);
      },
    );

    it('refuses to start when a refinement lands after the claim, without calling Spotify', async () => {
      const world = setup(generatedSession());
      const withPending = {
        ...world.stored(),
        pendingRefinement: PENDING[0],
        updatedAt: new Date(Date.now() + 1).toISOString(),
      };
      world.sessions.acquireDestinationClaim.mockImplementationOnce(() => {
        world.replace(withPending);
        return Promise.resolve('claim-1');
      });

      await expect(world.useCase.execute(COMMAND)).rejects.toMatchObject({
        code: 'AI_REFINEMENT_PENDING',
      });
      expect(world.publish).not.toHaveBeenCalled();
      expect(world.stored()).toBe(withPending);
    });

    it('never overwrites a refinement written between the claim re-read and the start', async () => {
      const world = setup(generatedSession());
      const withPending = {
        ...world.stored(),
        pendingRefinement: PENDING[0],
        updatedAt: new Date(Date.now() + 1).toISOString(),
      };
      world.sessions.saveIfUnchanged.mockImplementationOnce(() => {
        world.replace(withPending);
        return Promise.resolve(false);
      });

      await expect(world.useCase.execute(COMMAND)).rejects.toMatchObject({
        code: 'AI_REFINEMENT_PENDING',
      });
      expect(world.publish).not.toHaveBeenCalled();
      expect(world.stored()).toBe(withPending);
      expect(world.claims.has(TOKEN)).toBe(false);
    });
  });
});
