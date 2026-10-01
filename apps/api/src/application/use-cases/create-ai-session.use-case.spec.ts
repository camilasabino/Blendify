import { Logger } from '@nestjs/common';
import type { InterpretIntentResponse } from '@blendify/contracts/ai-service';
import { EMPTY_AI_PRESERVATION } from '@/domain/ai/ai-intent-patch';
import type { AiSession } from '@/domain/ai/ai-session';
import { AiInterpretationError } from '@/domain/errors/ai-interpretation.error';
import type { AiSessionRepositoryPort } from '@/domain/repositories/ai-session.repository.port';
import type { IntentInterpreterPort } from '@/domain/repositories/intent-interpreter.port';
import {
  AI_SESSION_TTL_MS,
  CreateAiSessionUseCase,
} from './create-ai-session.use-case';

const PROMPT = '30 deep cuts from Radiohead and Interpol, no Coldplay';
const NOW = new Date('2026-09-27T12:00:00.000Z');

function interpreted(
  overrides: Record<string, unknown> = {},
): InterpretIntentResponse {
  return {
    promptVersion: 'intent-v2',
    result: {
      outcome: 'interpreted',
      intent: {
        kind: 'artist_mix',
        artists: ['Radiohead', 'Interpol'],
        genres: [],
        seedTracks: [],
        filters: {
          region: null,
          femaleVocals: false,
          releaseRange: null,
          excludeLive: false,
        },
        targetTrackCount: 30,
        targetDurationMinutes: null,
        mood: null,
        popularity: 'rarities',
        orderMode: null,
        excludeArtists: ['Coldplay'],
        excludeTracks: [],
        unsupportedConstraints: [],
        ...overrides,
      },
    },
  };
}

function createUseCase(response: InterpretIntentResponse | Error) {
  const interpreter = {
    interpretIntent: jest.fn<
      ReturnType<IntentInterpreterPort['interpretIntent']>,
      Parameters<IntentInterpreterPort['interpretIntent']>
    >(() =>
      response instanceof Error
        ? Promise.reject(response)
        : Promise.resolve(response),
    ),
  };
  const saved: Array<{ token: string; session: AiSession; ttlMs: number }> = [];
  const sessions: AiSessionRepositoryPort = {
    save: jest.fn((token: string, session: AiSession, ttlMs: number) => {
      saved.push({ token, session, ttlMs });
      return Promise.resolve();
    }),
    find: jest.fn(() => Promise.resolve(null)),
    acquireGenerationLock: jest.fn(() => Promise.resolve('lease')),
    releaseGenerationLock: jest.fn(() => Promise.resolve()),
    hasGenerationLock: jest.fn(() => Promise.resolve(false)),
    saveGenerationOutcome: jest.fn(() => Promise.resolve(true)),
    acquireDestinationClaim: jest.fn(() => Promise.resolve('claim-1')),
    releaseDestinationClaim: jest.fn(() => Promise.resolve()),
    renewDestinationClaim: jest.fn(() => Promise.resolve(true)),
    hasDestinationClaim: jest.fn(() => Promise.resolve(false)),
    savePublishOutcome: jest.fn(() => Promise.resolve(true)),
    renewGenerationLock: jest.fn(() => Promise.resolve(true)),
    saveIfUnchanged: jest.fn(() => Promise.resolve(true)),
    acquireRefinementLock: jest.fn(() =>
      Promise.resolve<string | null>('refinement-lock'),
    ),
    renewRefinementLock: jest.fn(() => Promise.resolve(true)),
    releaseRefinementLock: jest.fn(() => Promise.resolve()),
  };
  const useCase = new CreateAiSessionUseCase(interpreter, sessions);
  return { useCase, interpreter, saved };
}

describe('CreateAiSessionUseCase', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('sends only the user prompt to the AI interpreter', async () => {
    const { useCase, interpreter } = createUseCase(interpreted());

    await useCase.execute({ prompt: PROMPT, userId: null });

    expect(interpreter.interpretIntent).toHaveBeenCalledWith({
      prompt: PROMPT,
    });
  });

  it('stores a bounded review session with unresolved names and no execution state', async () => {
    const { useCase, saved } = createUseCase(interpreted());

    const result = await useCase.execute({ prompt: PROMPT, userId: 'user-1' });

    const [{ token, session, ttlMs }] = saved;
    expect(token).toBe(result.token);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(ttlMs).toBe(AI_SESSION_TTL_MS);
    expect(session).toMatchObject({
      ownerUserId: 'user-1',
      originalPrompt: PROMPT,
      promptVersion: 'intent-v2',
      clarification: null,
      createdAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + AI_SESSION_TTL_MS).toISOString(),
      aiSafe: {
        intent: { artists: ['Radiohead', 'Interpol'] },
        preservation: EMPTY_AI_PRESERVATION,
      },
    });
    expect(session.execution).toBeNull();
  });

  it('keeps an unresolved seed track as the user-authored names', async () => {
    const { useCase } = createUseCase(
      interpreted({
        kind: 'discover_track',
        artists: [],
        seedTracks: [{ title: 'Teardrop', artist: 'Massive Attack' }],
        filters: {
          region: null,
          femaleVocals: false,
          releaseRange: null,
          excludeLive: false,
        },
      }),
    );

    const { session } = await useCase.execute({
      prompt: 'Start from Teardrop by Massive Attack',
      userId: null,
    });

    expect(session.clarification).toBeNull();
    expect(session.aiSafe.intent?.seedTracks).toEqual([
      { title: 'Teardrop', artist: 'Massive Attack' },
    ]);
  });

  it('preserves mood, target duration and track count through the session', async () => {
    const { useCase, saved } = createUseCase(
      interpreted({
        kind: 'genre_mix',
        artists: [],
        targetTrackCount: 30,
        targetDurationMinutes: 60,
        mood: 'happy',
        excludeArtists: [],
        unsupportedConstraints: [
          { category: 'activity', userText: 'to dance at a party' },
        ],
      }),
    );

    await useCase.execute({ prompt: 'Happy music', userId: null });

    const [{ session }] = saved;
    expect(session.clarification).toBeNull();
    expect(session.aiSafe.intent).toMatchObject({
      kind: 'genre_mix',
      genres: [],
      targetTrackCount: 30,
      targetDurationMinutes: 60,
      mood: 'happy',
      unsupportedConstraints: [
        { category: 'activity', userText: 'to dance at a party' },
      ],
    });
  });

  it('issues a different opaque token for every session', async () => {
    const { useCase } = createUseCase(interpreted());

    const first = await useCase.execute({ prompt: PROMPT, userId: null });
    const second = await useCase.execute({ prompt: PROMPT, userId: null });

    expect(first.token).not.toBe(second.token);
    expect(first.session.ownerUserId).toBeNull();
  });

  it('keeps a model clarification without resolving anything', async () => {
    const { useCase } = createUseCase({
      promptVersion: 'intent-v2',
      result: {
        outcome: 'needs_clarification',
        clarification: {
          reason: 'unsupported_constraint',
          unsupportedConstraints: [
            { category: 'activity', userText: 'for a long run' },
          ],
        },
      },
    });

    const { session } = await useCase.execute({
      prompt: 'Music for a long run',
      userId: null,
    });

    expect(session.aiSafe.intent).toBeNull();
    expect(session.clarification?.reason).toBe('unsupported_constraint');
  });

  it('turns an over-limit request into a clarification', async () => {
    const { useCase } = createUseCase(interpreted({ targetTrackCount: 200 }));

    const { session } = await useCase.execute({ prompt: PROMPT, userId: null });

    expect(session.clarification?.reason).toBe('track_count_over_limit');
  });

  it('propagates interpretation failures without storing a session', async () => {
    const { useCase, saved } = createUseCase(
      AiInterpretationError.unavailable(),
    );

    await expect(
      useCase.execute({ prompt: PROMPT, userId: null }),
    ).rejects.toEqual(AiInterpretationError.unavailable());
    expect(saved).toEqual([]);
  });
});
