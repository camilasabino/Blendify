import { Logger } from '@nestjs/common';
import type { InterpretIntentResponse } from '@blendify/contracts/ai-service';
import { AiIntentEvaluator } from '@/application/services/ai-intent-evaluator.service';
import { AiIntentResolver } from '@/application/services/ai-intent-resolver.service';
import { Artist } from '@/domain/artist/artist.entity';
import type { AiSession } from '@/domain/ai/ai-session';
import { AiInterpretationError } from '@/domain/errors/ai-interpretation.error';
import type { AiSessionRepositoryPort } from '@/domain/repositories/ai-session.repository.port';
import type { IntentInterpreterPort } from '@/domain/repositories/intent-interpreter.port';
import { ArtistId } from '@/domain/value-objects/artist-id.vo';
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
    promptVersion: 'intent-v1',
    result: {
      outcome: 'interpreted',
      intent: {
        kind: 'artist_mix',
        artists: ['Radiohead', 'Interpol'],
        genres: [],
        seedTracks: [],
        targetTrackCount: 30,
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
  };
  const catalog = {
    searchArtists: jest.fn((name: string) =>
      Promise.resolve([
        Artist.create({ id: ArtistId.create(name.toLowerCase()), name }),
      ]),
    ),
    searchTracks: jest.fn(),
    resolveTrack: jest.fn(),
    getArtistsByIds: jest.fn(),
  };
  const evaluator = new AiIntentEvaluator(
    new AiIntentResolver({ forMarket: () => catalog }),
  );
  const useCase = new CreateAiSessionUseCase(interpreter, sessions, evaluator);
  return { useCase, interpreter, saved, catalog };
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

  it('stores a bounded session with separate AI-safe and execution state', async () => {
    const { useCase, saved } = createUseCase(interpreted());

    const result = await useCase.execute({ prompt: PROMPT, userId: 'user-1' });

    const [{ token, session, ttlMs }] = saved;
    expect(token).toBe(result.token);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(ttlMs).toBe(AI_SESSION_TTL_MS);
    expect(session).toMatchObject({
      ownerUserId: 'user-1',
      originalPrompt: PROMPT,
      promptVersion: 'intent-v1',
      clarification: null,
      createdAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + AI_SESSION_TTL_MS).toISOString(),
      aiSafe: { intent: { artists: ['Radiohead', 'Interpol'] } },
      execution: {
        resolvedSeeds: {
          artists: [
            { id: 'radiohead', name: 'Radiohead' },
            { id: 'interpol', name: 'Interpol' },
          ],
        },
      },
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
    const { useCase, catalog } = createUseCase({
      promptVersion: 'intent-v1',
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
    expect(catalog.searchArtists).not.toHaveBeenCalled();
  });

  it('turns an over-limit request into a clarification before any catalog call', async () => {
    const { useCase, catalog } = createUseCase(
      interpreted({ targetTrackCount: 200 }),
    );

    const { session } = await useCase.execute({ prompt: PROMPT, userId: null });

    expect(session.clarification?.reason).toBe('track_count_over_limit');
    expect(session.execution).toBeNull();
    expect(catalog.searchArtists).not.toHaveBeenCalled();
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
