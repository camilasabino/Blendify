import { describe, expect, it } from 'vitest';
import {
  AI_MOODS,
  AI_PROMPT_MAX_LENGTH,
  AiGenerationSchema,
  AiGenerationStreamEventSchema,
  AiSessionSchema,
  AiSessionStateSchema,
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
    targetDurationMinutes: null,
    mood: null,
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

  it('carries a mood-only review with a target duration and no seeds', () => {
    const moodOnly = {
      ...READY_SESSION,
      intent: {
        ...READY_SESSION.intent,
        kind: 'genre_mix',
        artists: [],
        targetTrackCount: null,
        targetDurationMinutes: 60,
        mood: 'happy',
        popularity: null,
        excludeArtists: [],
        unmetConstraints: [
          { category: 'activity', userText: 'to dance at a party' },
        ],
      },
    };

    expect(AiSessionSchema.parse(moodOnly)).toEqual(moodOnly);
  });

  it('carries an unresolved seed track as user-authored names only', () => {
    const trackReview = {
      ...READY_SESSION,
      intent: {
        ...READY_SESSION.intent,
        kind: 'discover_track',
        artists: [],
        seedTrack: { title: 'Teardrop', artist: 'Massive Attack' },
      },
    };

    expect(AiSessionSchema.parse(trackReview)).toEqual(trackReview);
    expect(
      AiSessionSchema.safeParse({
        ...trackReview,
        intent: {
          ...trackReview.intent,
          seedTrack: { ...trackReview.intent.seedTrack, id: '4uLU6hMCjMI75M1A2tKUQC' },
        },
      }).success,
    ).toBe(false);
  });

  it('keeps the closed canonical mood vocabulary', () => {
    expect(AI_MOODS).toEqual([
      'happy',
      'calm',
      'energetic',
      'sad',
      'romantic',
      'angry',
      'dark',
      'nostalgic',
      'dreamy',
    ]);
  });

  it.each(AI_MOODS)('accepts the %s mood in the summary', (mood) => {
    const result = AiSessionSchema.safeParse({
      ...READY_SESSION,
      intent: { ...READY_SESSION.intent, mood },
    });

    expect(result.success).toBe(true);
  });

  it.each(['groovy', 'party', 'workout', 'chill'])(
    'rejects %s outside the closed mood vocabulary',
    (mood) => {
      const result = AiSessionSchema.safeParse({
        ...READY_SESSION,
        intent: { ...READY_SESSION.intent, mood },
      });

      expect(result.success).toBe(false);
    },
  );

  it.each([0, -30, 45.5])('rejects a summarized target duration of %s', (minutes) => {
    const result = AiSessionSchema.safeParse({
      ...READY_SESSION,
      intent: { ...READY_SESSION.intent, targetDurationMinutes: minutes },
    });

    expect(result.success).toBe(false);
  });

  it.each(['artists_not_found', 'tracks_not_found'])(
    'no longer reports the provider-backed %s clarification at review time',
    (reason) => {
      const result = AiSessionSchema.safeParse({
        ...CLARIFICATION_SESSION,
        clarification: { ...CLARIFICATION_SESSION.clarification, reason },
      });

      expect(result.success).toBe(false);
    },
  );

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

const GENERATION = {
  sessionId: 'opaque-session-token',
  expiresAt: '2026-09-27T12:30:00.000Z',
  status: 'generated',
  intent: { ...READY_SESSION.intent, targetDurationMinutes: 60, mood: 'calm' },
  playlist: {
    name: 'Blendify · Radiohead · Interpol',
    description: 'Made with Blendify.',
    seeds: [{ type: 'artist', id: 'artist-1', name: 'Radiohead' }],
    tracks: [
      {
        id: 'track-1',
        name: 'Reckoner',
        artistId: 'artist-1',
        artistName: 'Radiohead',
        durationMs: 290_000,
        popularity: 60,
        uri: 'spotify:track:track-1',
      },
    ],
  },
  trackCount: 1,
  durationMs: 290_000,
  unmetConstraints: [
    { type: 'track_count', requested: 30, actual: 1 },
    { type: 'duration', requestedMinutes: 60, actualDurationMs: 290_000 },
    { type: 'mood', mood: 'calm', reason: 'seed_not_mood_based' },
  ],
};

describe('AI generation contracts', () => {
  it('accepts a generated preview with explicit unmet constraints', () => {
    expect(AiGenerationSchema.parse(GENERATION)).toEqual(GENERATION);
  });

  it('never carries a transfer offer, the internal generator recipe or unknown top-level state', () => {
    const withInternals = {
      ...GENERATION,
      playlist: {
        ...GENERATION.playlist,
        transfer: null,
        generation: {
          version: 1,
          kind: 'discover_artist',
          targetTrackCount: 30,
          seed: { id: 'artist-1', name: 'Radiohead' },
          popularity: 'balanced',
          orderMode: 'random',
        },
      },
    };

    const parsed = AiGenerationSchema.parse(withInternals).playlist;
    expect(parsed).not.toHaveProperty('transfer');
    expect(parsed).not.toHaveProperty('generation');
    expect(
      AiGenerationSchema.safeParse({ ...GENERATION, executionPlan: {} }).success,
    ).toBe(false);
    expect(
      AiGenerationSchema.safeParse({ ...GENERATION, status: 'generating' }).success,
    ).toBe(false);
  });

  it('rejects unmet constraints outside the deterministic vocabulary', () => {
    for (const unmet of [
      { type: 'mood', mood: 'calm', reason: 'model_said_so' },
      { type: 'mood', mood: 'happy', reason: 'genres_outside_mood' },
      { type: 'duration', requestedMinutes: 0, actualDurationMs: 1 },
      { type: 'track_count', requested: MAX_TRACKS + 1, actual: 1 },
      { type: 'activity', userText: 'running' },
    ]) {
      expect(
        AiGenerationSchema.safeParse({ ...GENERATION, unmetConstraints: [unmet] })
          .success,
      ).toBe(false);
    }
  });

  it('streams progress, the generated result or a normalized error', () => {
    for (const event of [
      { type: 'progress', phase: 'matching_tracks', current: 1, total: 2, percent: 50 },
      { type: 'result', playlist: GENERATION },
      {
        type: 'error',
        statusCode: 429,
        code: 'SPOTIFY_RATE_LIMITED',
        message: 'Spotify rate limit.',
        details: { retryAfterSeconds: 30 },
      },
    ]) {
      expect(AiGenerationStreamEventSchema.safeParse(event).success).toBe(true);
    }
  });
});

describe('AI session state contract', () => {
  const outcome = {
    playlist: GENERATION.playlist,
    trackCount: GENERATION.trackCount,
    durationMs: GENERATION.durationMs,
    unmetConstraints: GENERATION.unmetConstraints,
  };

  it('restores every public session state', () => {
    for (const state of [
      { ...CLARIFICATION_SESSION, execution: null },
      { ...READY_SESSION, execution: null },
      { ...READY_SESSION, execution: { status: 'generating' } },
      { ...READY_SESSION, execution: { status: 'generated', ...outcome } },
      {
        ...READY_SESSION,
        execution: {
          status: 'generation_failed',
          error: {
            code: 'SPOTIFY_RATE_LIMITED',
            category: 'provider_rate_limited',
            retryAfterSeconds: 30,
            seedNotFound: null,
          },
        },
      },
      {
        ...READY_SESSION,
        execution: {
          status: 'generation_failed',
          error: {
            code: 'AI_SEED_NOT_FOUND',
            category: 'seed_not_found',
            retryAfterSeconds: null,
            seedNotFound: { seedType: 'artist', names: ['Radiohed'] },
          },
        },
      },
    ]) {
      expect(AiSessionStateSchema.parse(state)).toEqual(state);
    }
  });

  it('rejects internal execution details and unknown failure categories', () => {
    for (const execution of [
      { status: 'generating', startedAt: '2026-09-27T12:00:00.000Z' },
      { status: 'generating', lockToken: 'lease' },
      { status: 'generated', ...outcome, executionPlan: {} },
      {
        status: 'generation_failed',
        error: {
          code: 'X',
          category: 'provider_raw',
          retryAfterSeconds: null,
          seedNotFound: null,
        },
      },
      {
        status: 'generation_failed',
        error: {
          code: 'CATALOG_UNAVAILABLE',
          category: 'provider_unavailable',
          retryAfterSeconds: null,
          seedNotFound: { seedType: 'artist', names: ['Radiohead'] },
        },
      },
      {
        status: 'generation_failed',
        error: {
          code: 'AI_SEED_NOT_FOUND',
          category: 'seed_not_found',
          retryAfterSeconds: null,
          seedNotFound: {
            seedType: 'artist',
            names: ['Radiohed'],
            providerIds: ['spotify:artist:1'],
          },
        },
      },
      {
        status: 'generation_failed',
        error: {
          code: 'AI_SEED_NOT_FOUND',
          category: 'seed_not_found',
          retryAfterSeconds: null,
          seedNotFound: { seedType: 'artist', names: [] },
        },
      },
      {
        status: 'generation_failed',
        error: {
          code: 'X',
          category: 'failed',
          retryAfterSeconds: null,
          seedNotFound: null,
          providerPayload: {},
        },
      },
    ]) {
      expect(
        AiSessionStateSchema.safeParse({ ...READY_SESSION, execution })
          .success,
      ).toBe(false);
    }
    expect(
      AiSessionStateSchema.safeParse({ ...READY_SESSION, execution: undefined })
        .success,
    ).toBe(false);
  });
});
