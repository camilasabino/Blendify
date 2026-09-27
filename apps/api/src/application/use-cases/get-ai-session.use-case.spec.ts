import type { AiIntent } from '@/domain/ai/ai-intent';
import { findIntentClarification } from '@/domain/ai/ai-intent-rules';
import {
  AI_GENERATION_INTERRUPTED_CODE,
  AI_SESSION_RECORD_VERSION,
  type AiSession,
  type AiSessionExecution,
} from '@/domain/ai/ai-session';
import { AiSessionError } from '@/domain/errors/ai-session.error';
import type { AiSessionRepositoryPort } from '@/domain/repositories/ai-session.repository.port';
import { GetAiSessionUseCase } from './get-ai-session.use-case';

const TOKEN = 'session-token';
const MINUTE_MS = 60_000;
const STARTED_AT = '2026-09-27T12:00:00.000Z';

function intent(overrides: Partial<AiIntent> = {}): AiIntent {
  return {
    kind: 'artist_mix',
    artists: ['Radiohead'],
    genres: [],
    seedTracks: [],
    targetTrackCount: null,
    targetDurationMinutes: null,
    mood: null,
    popularity: null,
    orderMode: null,
    excludeArtists: [],
    excludeTracks: [],
    unsupportedConstraints: [],
    ...overrides,
  };
}

function session(overrides: Partial<AiSession> = {}): AiSession {
  const reviewed = overrides.aiSafe?.intent ?? intent();
  return {
    version: AI_SESSION_RECORD_VERSION,
    ownerUserId: null,
    originalPrompt: 'Radiohead',
    promptVersion: 'intent-v3',
    aiSafe: { intent: reviewed },
    clarification: findIntentClarification(reviewed),
    execution: null,
    createdAt: STARTED_AT,
    updatedAt: STARTED_AT,
    expiresAt: new Date(Date.now() + 30 * MINUTE_MS).toISOString(),
    ...overrides,
  };
}

function createWorld(reads: Array<AiSession | null>, lockHeld = false) {
  const sessions = {
    save: jest.fn(() => Promise.resolve()),
    find: jest.fn(() =>
      Promise.resolve(reads.length > 1 ? (reads.shift() ?? null) : reads[0]),
    ),
    acquireGenerationLock: jest.fn(() => Promise.resolve<string | null>(null)),
    releaseGenerationLock: jest.fn(() => Promise.resolve()),
    hasGenerationLock: jest.fn(() => Promise.resolve(lockHeld)),
    saveGenerationOutcome: jest.fn(() => Promise.resolve(true)),
    renewGenerationLock: jest.fn(() => Promise.resolve(true)),
  } satisfies AiSessionRepositoryPort;

  return { sessions, useCase: new GetAiSessionUseCase(sessions) };
}

const GENERATING: AiSessionExecution = {
  status: 'generating',
  attemptId: 'attempt-a',
  startedAt: STARTED_AT,
};

describe('GetAiSessionUseCase', () => {
  it.each([
    [
      'clarification pending',
      session({ aiSafe: { intent: intent({ genres: ['Shoegaze'] }) } }),
    ],
    ['reviewed', session()],
    [
      'generated',
      session({
        execution: {
          status: 'generated',
          startedAt: STARTED_AT,
          completedAt: STARTED_AT,
          result: {
            playlist: { name: 'Mix', description: '', seeds: [], tracks: [] },
            recipe: {
              version: 1,
              kind: 'artist_mix',
              tracksPerSeed: 10,
              seeds: [{ id: 'radiohead-id', name: 'Radiohead' }],
              popularity: 'balanced',
              orderMode: 'random',
            },
            durationMs: 0,
            unmetConstraints: [],
          },
        },
      }),
    ],
    [
      'generation_failed',
      session({
        execution: {
          status: 'generation_failed',
          startedAt: STARTED_AT,
          failedAt: STARTED_AT,
          failure: {
            code: 'SPOTIFY_RATE_LIMITED',
            category: 'provider_rate_limited',
            retryAfterSeconds: 30,
          },
        },
      }),
    ],
  ])('returns the persisted %s state without writing', async (_, stored) => {
    const world = createWorld([stored]);

    await expect(
      world.useCase.execute({ token: TOKEN, userId: null }),
    ).resolves.toEqual({ token: TOKEN, session: stored });
    expect(world.sessions.save).not.toHaveBeenCalled();
    expect(world.sessions.acquireGenerationLock).not.toHaveBeenCalled();
  });

  it('keeps a generating state while its generation lease is held', async () => {
    const stored = session({ execution: GENERATING });
    const world = createWorld([stored], true);

    const { session: result } = await world.useCase.execute({
      token: TOKEN,
      userId: null,
    });

    expect(result.execution).toEqual(GENERATING);
  });

  it('reports a generating state without a lease as interrupted, without persisting it', async () => {
    const stored = session({ execution: GENERATING });
    const world = createWorld([stored, stored]);

    const { session: result } = await world.useCase.execute({
      token: TOKEN,
      userId: null,
    });

    expect(result.execution).toMatchObject({
      status: 'generation_failed',
      failure: {
        code: AI_GENERATION_INTERRUPTED_CODE,
        category: 'failed',
        retryAfterSeconds: null,
      },
    });
    expect(world.sessions.save).not.toHaveBeenCalled();
  });

  it('returns the newer state when the generation finished or restarted between reads', async () => {
    const restarted = session({
      execution: {
        status: 'generating',
        attemptId: 'attempt-b',
        startedAt: '2026-09-27T12:05:00.000Z',
      },
    });
    const world = createWorld([session({ execution: GENERATING }), restarted]);

    const { session: result } = await world.useCase.execute({
      token: TOKEN,
      userId: null,
    });

    expect(result).toBe(restarted);
  });

  it('hides sessions that are missing, expired or owned by someone else', async () => {
    for (const [stored, userId] of [
      [null, null],
      [session({ expiresAt: new Date(Date.now() - 1).toISOString() }), null],
      [session({ ownerUserId: 'owner' }), 'intruder'],
      [session({ ownerUserId: 'owner' }), null],
    ] as const) {
      const world = createWorld([stored]);

      await expect(
        world.useCase.execute({ token: TOKEN, userId }),
      ).rejects.toEqual(AiSessionError.notFound());
    }
  });

  it('lets the owner read an authenticated session', async () => {
    const stored = session({ ownerUserId: 'owner' });
    const world = createWorld([stored]);

    await expect(
      world.useCase.execute({ token: TOKEN, userId: 'owner' }),
    ).resolves.toMatchObject({ session: stored });
  });
});
