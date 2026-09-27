import { describe, expect, it } from 'vitest';
import {
  AI_PROMPT_MAX_LENGTH,
  AiSessionSchema,
  AnswerAiClarificationRequestSchema,
  CreateAiSessionRequestSchema,
  MAX_TRACKS,
} from './index';
import { AI_INTENT_PROMPT_MAX_LENGTH } from './ai-service';

const READY_SESSION = {
  sessionId: 'opaque-session-token',
  expiresAt: '2026-09-27T12:30:00.000Z',
  status: 'ready',
  intent: {
    kind: 'artist_mix',
    artists: ['Radiohead', 'Interpol'],
    genres: [],
    seedTrack: null,
    targetTrackCount: 30,
    popularity: 'rarities',
    orderMode: null,
    excludeArtists: ['Coldplay'],
    excludeTracks: [],
    unmetConstraints: [{ category: 'mood', userText: 'rainy day vibes' }],
  },
  clarification: null,
};

const CLARIFICATION_SESSION = {
  sessionId: 'opaque-session-token',
  expiresAt: '2026-09-27T12:30:00.000Z',
  status: 'needs_clarification',
  intent: null,
  clarification: {
    reason: 'unsupported_ordering',
    seedType: null,
    limit: null,
    names: [],
    unsupportedConstraints: [
      { category: 'energy', userText: 'more energetic over time' },
    ],
    options: [
      { id: 'set_order_mode:random', type: 'set_order_mode', orderMode: 'random' },
      { id: 'set_order_mode:artist', type: 'set_order_mode', orderMode: 'artist' },
    ],
  },
};

describe('AI session contracts', () => {
  it('accepts a ready session with an interpreted intent summary', () => {
    expect(AiSessionSchema.parse(READY_SESSION)).toEqual(READY_SESSION);
  });

  it('accepts a clarification with structured options', () => {
    expect(AiSessionSchema.parse(CLARIFICATION_SESSION)).toEqual(
      CLARIFICATION_SESSION,
    );
  });

  it('rejects unknown fields on the public session', () => {
    const result = AiSessionSchema.safeParse({
      ...READY_SESSION,
      promptVersion: 'intent-v1',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a summarized track count above the product limit', () => {
    const result = AiSessionSchema.safeParse({
      ...READY_SESSION,
      intent: { ...READY_SESSION.intent, targetTrackCount: MAX_TRACKS + 1 },
    });

    expect(result.success).toBe(false);
  });

  it('bounds the public prompt with the same limit as the AI service wire', () => {
    const atLimit = 'a'.repeat(AI_PROMPT_MAX_LENGTH);

    expect(AI_INTENT_PROMPT_MAX_LENGTH).toBe(AI_PROMPT_MAX_LENGTH);
    expect(CreateAiSessionRequestSchema.safeParse({ prompt: atLimit }).success).toBe(
      true,
    );
    expect(
      CreateAiSessionRequestSchema.safeParse({ prompt: `${atLimit}a` }).success,
    ).toBe(false);
    expect(CreateAiSessionRequestSchema.safeParse({ prompt: '   ' }).success).toBe(
      false,
    );
  });

  it('accepts only an option id when answering a clarification', () => {
    expect(
      AnswerAiClarificationRequestSchema.safeParse({ optionId: 'set_kind:artist_mix' })
        .success,
    ).toBe(true);
    expect(
      AnswerAiClarificationRequestSchema.safeParse({
        optionId: 'set_kind:artist_mix',
        intent: { kind: 'genre_mix' },
      }).success,
    ).toBe(false);
  });
});
