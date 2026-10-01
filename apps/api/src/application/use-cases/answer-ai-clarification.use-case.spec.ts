import { EMPTY_AI_PRESERVATION } from '@/domain/ai/ai-intent-patch';
import type { AiIntent } from '@/domain/ai/ai-intent';
import { findIntentClarification } from '@/domain/ai/ai-intent-rules';
import {
  AI_SESSION_RECORD_VERSION,
  type AiSession,
} from '@/domain/ai/ai-session';
import { AiSessionError } from '@/domain/errors/ai-session.error';
import type { AiSessionRepositoryPort } from '@/domain/repositories/ai-session.repository.port';
import { AnswerAiClarificationUseCase } from './answer-ai-clarification.use-case';

const TOKEN = 'session-token';
const NOW = new Date('2026-09-27T12:00:00.000Z');
const EXPIRES_AT = new Date(NOW.getTime() + 10 * 60_000);

const DISCOVER_INTENT: AiIntent = {
  kind: 'discover_artist',
  artists: ['Radiohead', 'Interpol'],
  genres: [],
  seedTracks: [],
  filters: { region: null },
  targetTrackCount: null,
  targetDurationMinutes: 45,
  mood: 'dark',
  popularity: null,
  orderMode: null,
  excludeArtists: [],
  excludeTracks: [],
  unsupportedConstraints: [],
};

function storedSession(overrides: Partial<AiSession> = {}): AiSession {
  return {
    version: AI_SESSION_RECORD_VERSION,
    ownerUserId: null,
    originalPrompt: 'Music like Radiohead and Interpol',
    promptVersion: 'intent-v2',
    aiSafe: { intent: DISCOVER_INTENT, preservation: EMPTY_AI_PRESERVATION },
    clarification: findIntentClarification(DISCOVER_INTENT),
    execution: null,
    destination: null,
    refinementAttempts: 0,
    pendingRefinement: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    expiresAt: EXPIRES_AT.toISOString(),
    ...overrides,
  };
}

function createUseCase(session: AiSession | null) {
  const saved: Array<{ session: AiSession; ttlMs: number }> = [];
  const sessions: AiSessionRepositoryPort = {
    save: jest.fn((_token: string, next: AiSession, ttlMs: number) => {
      saved.push({ session: next, ttlMs });
      return Promise.resolve();
    }),
    find: jest.fn(() => Promise.resolve(session)),
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
  return {
    useCase: new AnswerAiClarificationUseCase(sessions),
    saved,
  };
}

describe('AnswerAiClarificationUseCase', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('applies an offered option and reviews the updated intent without a model call', async () => {
    const { useCase, saved } = createUseCase(storedSession());

    const { session } = await useCase.execute({
      token: TOKEN,
      optionId: 'keep_seed:artist:1',
      userId: null,
    });

    expect(session.aiSafe.intent).toMatchObject({
      artists: ['Interpol'],
      targetDurationMinutes: 45,
      mood: 'dark',
    });
    expect(session.clarification).toBeNull();
    expect(saved[0].ttlMs).toBe(EXPIRES_AT.getTime() - NOW.getTime());
    expect(saved[0].session.expiresAt).toBe(EXPIRES_AT.toISOString());
  });

  it('rejects an option that was not offered', async () => {
    const { useCase, saved } = createUseCase(storedSession());

    await expect(
      useCase.execute({
        token: TOKEN,
        optionId: 'set_track_count:50',
        userId: null,
      }),
    ).rejects.toEqual(AiSessionError.optionUnavailable());
    expect(saved).toEqual([]);
  });

  it.each([
    ['a missing session', null, null],
    [
      'an expired session',
      storedSession({ expiresAt: new Date(NOW.getTime() - 1).toISOString() }),
      null,
    ],
    [
      "another user's session",
      storedSession({ ownerUserId: 'user-1' }),
      'user-2',
    ],
    [
      'a user session read as Guest',
      storedSession({ ownerUserId: 'user-1' }),
      null,
    ],
  ])('reports %s as not found', async (_label, session, userId) => {
    const { useCase } = createUseCase(session);

    await expect(
      useCase.execute({ token: TOKEN, optionId: 'keep_seed:artist:0', userId }),
    ).rejects.toEqual(AiSessionError.notFound());
  });

  it('lets the owner continue an authenticated session', async () => {
    const { useCase } = createUseCase(storedSession({ ownerUserId: 'user-1' }));

    const { session } = await useCase.execute({
      token: TOKEN,
      optionId: 'set_kind:artist_mix',
      userId: 'user-1',
    });

    expect(session.aiSafe.intent).toMatchObject({
      kind: 'artist_mix',
      artists: ['Radiohead', 'Interpol'],
    });
    expect(session.clarification).toBeNull();
  });
});
