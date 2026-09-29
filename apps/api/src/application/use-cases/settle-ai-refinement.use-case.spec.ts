import { EMPTY_AI_PRESERVATION } from '@/domain/ai/ai-intent-patch';
import type { AiIntent } from '@/domain/ai/ai-intent';
import {
  AI_SESSION_RECORD_VERSION,
  type AiGenerationResult,
  type AiPendingRefinement,
  type AiSession,
} from '@/domain/ai/ai-session';
import type { AiSessionRepositoryPort } from '@/domain/repositories/ai-session.repository.port';
import { ApplyAiRefinementUseCase } from './apply-ai-refinement.use-case';
import { DismissAiRefinementUseCase } from './dismiss-ai-refinement.use-case';

const TOKEN = 'session-token';
const REFINEMENT_ID = 'refinement-1';

const INTENT_A: AiIntent = {
  kind: 'artist_mix',
  artists: ['Radiohead', 'Interpol'],
  genres: [],
  seedTracks: [],
  targetTrackCount: null,
  targetDurationMinutes: null,
  mood: null,
  popularity: 'balanced',
  orderMode: null,
  excludeArtists: [],
  excludeTracks: [],
  unsupportedConstraints: [],
};
const INTENT_B: AiIntent = { ...INTENT_A, popularity: 'rarities' };

function result(trackIds: string[]): AiGenerationResult {
  return {
    playlist: {
      name: 'Blendify · Radiohead',
      description: 'Made with Blendify.',
      seeds: [{ type: 'artist', id: 'radiohead-id', name: 'Radiohead' }],
      tracks: trackIds.map((id) => ({
        id,
        name: `Song ${id}`,
        artistId: 'radiohead-id',
        artistName: 'Radiohead',
        durationMs: 200_000,
        popularity: 40,
        uri: `spotify:track:${id}`,
      })),
    },
    recipe: {
      version: 1,
      kind: 'artist_mix',
      tracksPerSeed: 2,
      seeds: [{ id: 'radiohead-id', name: 'Radiohead' }],
      popularity: 'balanced',
      orderMode: 'random',
    },
    durationMs: trackIds.length * 200_000,
    unmetConstraints: [],
  };
}

const RESULT_A = result(['a1', 'a2']);
const RESULT_B = result(['a1', 'b2', 'b3']);

function readyPending(id = REFINEMENT_ID): AiPendingRefinement {
  return {
    id,
    status: 'proposed',
    promptVersion: 'refinement-v2',
    proposedAt: '2026-09-28T10:00:00.000Z',
    aiSafe: {
      intent: INTENT_B,
      preservation: { firstTracks: 1, positions: [], artists: [] },
      notApplied: [],
    },
    candidate: {
      status: 'ready',
      result: RESULT_B,
      preservedPositions: [1],
      diff: {
        tracks: {
          added: [
            { trackId: 'b2', position: 2 },
            { trackId: 'b3', position: 3 },
          ],
          removed: [{ trackId: 'a2', position: 2 }],
          moved: [],
          retainedCount: 1,
          replacedCount: 1,
          before: { trackCount: 2, durationMs: 400_000 },
          after: { trackCount: 3, durationMs: 600_000 },
        },
        intent: [{ field: 'popularity', from: 'balanced', to: 'rarities' }],
      },
    },
  };
}

function session(
  pendingRefinement: AiPendingRefinement | null = readyPending(),
): AiSession {
  const now = Date.now();
  return {
    version: AI_SESSION_RECORD_VERSION,
    ownerUserId: null,
    originalPrompt: 'Radiohead and Interpol',
    promptVersion: 'intent-v4',
    aiSafe: { intent: INTENT_A, preservation: EMPTY_AI_PRESERVATION },
    clarification: null,
    execution: {
      status: 'generated',
      startedAt: new Date(now).toISOString(),
      completedAt: new Date(now).toISOString(),
      result: RESULT_A,
    },
    destination: null,
    refinementAttempts: 1,
    pendingRefinement,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now + 60_000).toISOString(),
    expiresAt: new Date(now + 20 * 60_000).toISOString(),
  };
}

function setup(initial: AiSession) {
  let stored = initial;
  const sessions = {
    find: jest.fn(() => Promise.resolve(stored)),
    saveIfUnchanged: jest.fn(
      async (
        _token: string,
        next: AiSession,
        expectedUpdatedAt: string,
        _ttlMs: number,
      ) => {
        await Promise.resolve();
        if (stored.updatedAt !== expectedUpdatedAt) {
          return false;
        }
        stored = next;
        return true;
      },
    ),
  };
  const repository = sessions as unknown as AiSessionRepositoryPort;
  return {
    sessions,
    stored: () => stored,
    replace: (next: AiSession) => {
      stored = next;
    },
    apply: new ApplyAiRefinementUseCase(repository),
    dismiss: new DismissAiRefinementUseCase(repository),
  };
}

const command = (refinementId = REFINEMENT_ID) => ({
  token: TOKEN,
  userId: null,
  refinementId,
});

describe('Apply and dismiss a pending refinement', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('promotes intent, preservation and candidate in one fenced write', async () => {
    const initial = session();
    const world = setup(initial);
    const remainingTtlMs = Date.parse(initial.expiresAt) - Date.now();

    const { session: applied } = await world.apply.execute(command());

    expect(world.sessions.saveIfUnchanged).toHaveBeenCalledTimes(1);
    expect(world.sessions.saveIfUnchanged).toHaveBeenCalledWith(
      TOKEN,
      applied,
      initial.updatedAt,
      expect.any(Number),
    );
    const [, , , ttlMs] = world.sessions.saveIfUnchanged.mock.calls[0];
    expect(ttlMs).toBeGreaterThan(0);
    expect(ttlMs).toBeLessThanOrEqual(remainingTtlMs);
    expect(applied).toEqual({
      ...initial,
      aiSafe: {
        intent: INTENT_B,
        preservation: { firstTracks: 1, positions: [], artists: [] },
      },
      execution: {
        status: 'generated',
        startedAt: '2026-09-28T10:00:00.000Z',
        completedAt: '2026-09-28T10:00:00.000Z',
        result: RESULT_B,
      },
      pendingRefinement: null,
      updatedAt: applied.updatedAt,
    });
    expect(Date.parse(applied.updatedAt)).toBeGreaterThan(
      Date.parse(initial.updatedAt),
    );
    expect(world.stored()).toBe(applied);
  });

  it('persists a settings-only candidate so the rule outlives the unchanged songs', async () => {
    const pending = readyPending();
    if (pending.status !== 'proposed' || pending.candidate.status !== 'ready') {
      throw new Error('Expected a ready refinement.');
    }
    const excluding: AiIntent = { ...INTENT_A, excludeArtists: ['Coldplay'] };
    const initial = session({
      ...pending,
      aiSafe: { ...pending.aiSafe, intent: excluding },
      candidate: { ...pending.candidate, result: RESULT_A },
    });
    const world = setup(initial);

    const { session: applied } = await world.apply.execute(command());

    expect(applied.aiSafe.intent).toEqual(excluding);
    expect(applied.execution).toMatchObject({
      status: 'generated',
      result: RESULT_A,
    });
    expect(world.stored()).toBe(applied);
  });

  it('discards the pending refinement and leaves the current state untouched', async () => {
    const initial = session();
    const world = setup(initial);

    const { session: dismissed } = await world.dismiss.execute(command());

    expect(dismissed).toEqual({
      ...initial,
      pendingRefinement: null,
      updatedAt: dismissed.updatedAt,
    });
    expect(world.sessions.saveIfUnchanged).toHaveBeenCalledTimes(1);
  });

  it('lets exactly one of a racing apply and dismiss win, never mixing states', async () => {
    const world = setup(session());

    const outcomes = await Promise.allSettled([
      world.apply.execute(command()),
      world.dismiss.execute(command()),
    ]);

    const fulfilled = outcomes.filter(
      (outcome) => outcome.status === 'fulfilled',
    );
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: 'AI_REFINEMENT_STALE' });
    const final = world.stored();
    expect(final.pendingRefinement).toBeNull();
    const applied = final.aiSafe.intent === INTENT_B;
    expect(final.execution).toMatchObject({
      result: applied ? RESULT_B : RESULT_A,
    });
  });

  it('never settles a newer pending refinement from a stale id', async () => {
    const newer = session(readyPending('refinement-2'));
    const world = setup(newer);

    for (const useCase of [world.apply, world.dismiss]) {
      await expect(useCase.execute(command())).rejects.toMatchObject({
        code: 'AI_REFINEMENT_STALE',
      });
    }
    expect(world.sessions.saveIfUnchanged).not.toHaveBeenCalled();
    expect(world.stored()).toBe(newer);
  });

  it('re-checks the pending id after losing the fenced write', async () => {
    const world = setup(session());
    world.sessions.saveIfUnchanged.mockImplementationOnce(() => {
      world.replace({
        ...world.stored(),
        pendingRefinement: readyPending('refinement-2'),
        updatedAt: new Date(Date.now() + 120_000).toISOString(),
      });
      return Promise.resolve(false);
    });

    await expect(world.apply.execute(command())).rejects.toMatchObject({
      code: 'AI_REFINEMENT_STALE',
    });
    expect(world.stored().pendingRefinement?.id).toBe('refinement-2');
    expect(world.stored().aiSafe.intent).toBe(INTENT_A);
  });

  it('re-validates a ready candidate against its intent and refuses one that misses the duration', async () => {
    const pending = readyPending();
    if (pending.status !== 'proposed') {
      throw new Error('Expected a proposed refinement.');
    }
    const initial = session({
      ...pending,
      aiSafe: {
        ...pending.aiSafe,
        intent: { ...INTENT_B, targetDurationMinutes: 30 },
      },
    });
    const world = setup(initial);

    await expect(world.apply.execute(command())).rejects.toMatchObject({
      code: 'AI_REFINEMENT_NOT_APPLICABLE',
    });
    expect(world.sessions.saveIfUnchanged).not.toHaveBeenCalled();
    expect(world.stored()).toBe(initial);
  });

  it('gives up with a stale error when the session keeps changing', async () => {
    const world = setup(session());
    world.sessions.saveIfUnchanged.mockResolvedValue(false);

    await expect(world.apply.execute(command())).rejects.toMatchObject({
      code: 'AI_REFINEMENT_STALE',
    });
    expect(world.sessions.saveIfUnchanged).toHaveBeenCalledTimes(3);
  });

  it.each([
    [
      'a failed candidate',
      {
        id: REFINEMENT_ID,
        status: 'proposed',
        promptVersion: 'refinement-v2',
        proposedAt: '2026-09-28T10:00:00.000Z',
        aiSafe: {
          intent: INTENT_B,
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
      } satisfies AiPendingRefinement,
    ],
    [
      'a clarification',
      {
        id: REFINEMENT_ID,
        status: 'needs_clarification',
        promptVersion: 'refinement-v2',
        proposedAt: '2026-09-28T10:00:00.000Z',
        clarification: {
          reason: 'preserved_artist_not_found',
          seedType: null,
          limit: null,
          names: ['Björk'],
          unsupportedConstraints: [],
        },
      } satisfies AiPendingRefinement,
    ],
    [
      'an unchanged refinement',
      {
        id: REFINEMENT_ID,
        status: 'unchanged',
        promptVersion: 'refinement-v2',
        proposedAt: '2026-09-28T10:00:00.000Z',
      } satisfies AiPendingRefinement,
    ],
  ])('refuses to apply %s but dismisses it', async (_label, pending) => {
    const initial = session(pending);
    const world = setup(initial);

    await expect(world.apply.execute(command())).rejects.toMatchObject({
      code: 'AI_REFINEMENT_NOT_APPLICABLE',
    });
    expect(world.stored()).toBe(initial);

    const { session: dismissed } = await world.dismiss.execute(command());
    expect(dismissed.pendingRefinement).toBeNull();
    expect(dismissed.aiSafe).toBe(initial.aiSafe);
    expect(dismissed.execution).toBe(initial.execution);
  });

  it('refuses to apply once a destination exists', async () => {
    const initial: AiSession = {
      ...session(),
      destination: {
        status: 'transfer_prepared',
        preparedAt: new Date().toISOString(),
        transfer: {
          url: 'https://soundiiz.com/go/import-playlist/abcdefghijklmnop',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          trackCount: 2,
        },
      },
    };
    const world = setup(initial);

    await expect(world.apply.execute(command())).rejects.toMatchObject({
      code: 'AI_REFINEMENT_UNAVAILABLE',
    });
    expect(world.stored()).toBe(initial);
  });

  it('hides foreign sessions', async () => {
    const world = setup({ ...session(), ownerUserId: 'user-1' });

    for (const useCase of [world.apply, world.dismiss]) {
      await expect(
        useCase.execute({ ...command(), userId: 'user-2' }),
      ).rejects.toMatchObject({ code: 'AI_SESSION_NOT_FOUND' });
    }
    expect(world.sessions.saveIfUnchanged).not.toHaveBeenCalled();
  });
});
