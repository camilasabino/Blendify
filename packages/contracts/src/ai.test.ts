import { describe, expect, it } from 'vitest';
import {
  AI_MOODS,
  AI_PROMPT_MAX_LENGTH,
  AI_REFINEMENT_CLARIFICATION_REASONS,
  AI_REFINEMENT_ID_MAX_LENGTH,
  AI_REFINEMENT_MAX_LENGTH,
  AiCurrentPreservationSchema,
  AiGenerationFailureSchema,
  AiGenerationSchema,
  AiGenerationStreamEventSchema,
  AiRefinementIdSchema,
  AiRefinementResultSchema,
  AiSessionSchema,
  AiSessionStateSchema,
  AnswerAiClarificationRequestSchema,
  CreateAiRefinementRequestSchema,
  CreateAiSessionRequestSchema,
  MAX_TRACKS,
  PLAYLIST_NAME_MAX_LENGTH,
  PublishAiPlaylistRequestSchema,
  TransferAiPlaylistRequestSchema,
} from './index';
import {
  AI_INTENT_PROMPT_MAX_LENGTH,
  AI_REFINEMENT_TEXT_MAX_LENGTH,
} from './ai-service';

const READY_SESSION = {
  sessionId: 'opaque-session-token',
  expiresAt: '2026-09-27T12:30:00.000Z',
  status: 'ready',
  intent: {
    kind: 'artist_mix',
    artists: ['Radiohead', 'Interpol'],
    genres: [],
    region: null,
    seedTrack: null,
    targetTrackCount: 30,
    targetDurationMinutes: null,
    mood: null,
    moodNotAppliedReason: null,
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

  it('carries a canonical region beside canonical genres', () => {
    const regional = {
      ...READY_SESSION,
      intent: {
        ...READY_SESSION.intent,
        kind: 'genre_mix',
        artists: [],
        genres: ['Rock'],
        region: 'argentina',
      },
    };

    expect(AiSessionSchema.parse(regional)).toEqual(regional);
    expect(
      AiSessionSchema.safeParse({
        ...regional,
        intent: { ...regional.intent, region: 'Argentina' },
      }).success,
    ).toBe(false);
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

  it('states when a recognized mood is not applied, with a closed reason', () => {
    const genreWithMood = {
      ...READY_SESSION,
      intent: {
        ...READY_SESSION.intent,
        kind: 'genre_mix',
        artists: [],
        genres: ['Rock'],
        mood: 'energetic',
        moodNotAppliedReason: 'explicit_genre_precedence',
      },
    };

    expect(AiSessionSchema.parse(genreWithMood)).toEqual(genreWithMood);
    expect(
      AiSessionSchema.safeParse({
        ...genreWithMood,
        intent: { ...genreWithMood.intent, moodNotAppliedReason: 'model_said_so' },
      }).success,
    ).toBe(false);
  });

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
  ],
  transferAvailable: true,
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
      { type: 'mood', mood: 'calm', reason: 'seed_not_mood_based' },
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
    transferAvailable: GENERATION.transferAvailable,
  };
  const generated = {
    ...READY_SESSION,
    execution: { status: 'generated', ...outcome },
    preservation: {
      firstTracks: null,
      positions: [],
      artists: [],
      preservedPositions: [],
    },
    refinement: null,
  };

  it('restores every public session state', () => {
    for (const state of [
      { ...CLARIFICATION_SESSION, execution: null, destination: null },
      { ...READY_SESSION, execution: null, destination: null },
      { ...READY_SESSION, execution: { status: 'generating' }, destination: null },
      { ...generated, destination: null },
      { ...generated, destination: { status: 'publishing' } },
      {
        ...generated,
        destination: {
          status: 'published',
          spotifyUrl: 'https://open.spotify.com/playlist/p1',
          savedToLibrary: true,
        },
      },
      {
        ...generated,
        destination: { status: 'publish_incomplete', spotifyUrl: null },
      },
      {
        ...generated,
        destination: {
          status: 'transfer_prepared',
          transfer: {
            url: 'https://soundiiz.com/go/import-playlist/abcdefghijklmnop',
            expiresAt: '2026-09-28T12:00:00.000Z',
            trackCount: 1,
          },
        },
      },
      {
        ...READY_SESSION,
        destination: null,
        execution: {
          status: 'generation_failed',
          error: {
            code: 'SPOTIFY_RATE_LIMITED',
            category: 'provider_rate_limited',
            retryAfterSeconds: 30,
            retryAfterSource: 'spotify',
            seedNotFound: null,
          },
        },
      },
      {
        ...READY_SESSION,
        destination: null,
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
      const restored = { refinement: null, preservation: null, ...state };
      expect(AiSessionStateSchema.parse(restored)).toEqual(restored);
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
        AiSessionStateSchema.safeParse({
          ...READY_SESSION,
          execution,
          destination: null,
          preservation: null,
          refinement: null,
        }).success,
      ).toBe(false);
    }
    expect(
      AiSessionStateSchema.safeParse({
        ...READY_SESSION,
        execution: undefined,
        destination: null,
        preservation: null,
        refinement: null,
      }).success,
    ).toBe(false);
  });

  it('never exposes internal or raw provider destination details', () => {
    for (const destination of [
      undefined,
      { status: 'publishing', attemptId: 'attempt-1' },
      {
        status: 'published',
        spotifyUrl: 'https://open.spotify.com/playlist/p1',
        savedToLibrary: true,
        spotifyResponse: {},
      },
      { status: 'publish_incomplete', spotifyUrl: null, error: 'Spotify 500' },
      {
        status: 'transfer_prepared',
        transfer: {
          url: 'https://soundiiz.com/go/import-playlist/abcdefghijklmnop',
          expiresAt: '2026-09-28T12:00:00.000Z',
          trackCount: 1,
          payload: {},
        },
      },
      { status: 'transferring' },
    ]) {
      expect(
        AiSessionStateSchema.safeParse({ ...generated, destination }).success,
      ).toBe(false);
    }
  });
});

describe('AI destination requests', () => {
  it('accept only the user-authored playlist name and existing publication options', () => {
    expect(
      PublishAiPlaylistRequestSchema.parse({ name: '  Late night  ' }),
    ).toEqual({ name: 'Late night', persistToLibrary: true });
    expect(
      PublishAiPlaylistRequestSchema.parse({
        name: 'Late night',
        persistToLibrary: false,
        coverImageBase64: 'aGVsbG8=',
      }),
    ).toEqual({
      name: 'Late night',
      persistToLibrary: false,
      coverImageBase64: 'aGVsbG8=',
    });
    expect(TransferAiPlaylistRequestSchema.parse({ name: ' Mix ' })).toEqual({
      name: 'Mix',
    });
  });

  it('rejects blank or oversized names and any browser-supplied playlist contents', () => {
    for (const schema of [
      PublishAiPlaylistRequestSchema,
      TransferAiPlaylistRequestSchema,
    ]) {
      for (const body of [
        {},
        { name: '   ' },
        { name: 'x'.repeat(PLAYLIST_NAME_MAX_LENGTH + 1) },
        { name: 'Mix', tracks: [{ uri: 'spotify:track:other' }] },
        { name: 'Mix', trackIds: ['other'] },
        { name: 'Mix', playlist: {} },
      ]) {
        expect(schema.safeParse(body).success).toBe(false);
      }
    }
    expect(
      PublishAiPlaylistRequestSchema.safeParse({
        name: 'x'.repeat(PLAYLIST_NAME_MAX_LENGTH),
      }).success,
    ).toBe(true);
  });
});

describe('AI refinement contracts', () => {
  const CANDIDATE = {
    playlist: GENERATION.playlist,
    trackCount: GENERATION.trackCount,
    durationMs: GENERATION.durationMs,
    unmetConstraints: GENERATION.unmetConstraints,
  };
  const DIFF = {
    tracks: {
      added: [{ trackId: '4uLU6hMCjMI75M1A2tKUQC', position: 2 }],
      removed: [{ trackId: '6LgJvl0Xdtc73RJ1mmpotq', position: 3 }],
      moved: [{ trackId: '3SVAN3BRByDmHOhKyIDxfC', from: 2, to: 3 }],
      retainedCount: 2,
      replacedCount: 1,
      before: { trackCount: 3, durationMs: 645_000 },
      after: { trackCount: 3, durationMs: 650_000 },
    },
    intent: [
      { field: 'popularity', from: 'balanced', to: 'rarities' },
      { field: 'targetTrackCount', from: 30, to: null },
      { field: 'genres', added: ['Argentine Rock'], removed: [] },
      {
        field: 'excludeTracks',
        added: [{ title: 'Yellow', artist: 'Coldplay' }],
        removed: [],
      },
    ],
    preservedPositions: [1],
  };
  const PROPOSED = {
    sessionId: 'opaque-session-token',
    expiresAt: '2026-09-27T12:30:00.000Z',
    refinement: {
      id: '5f0c7a8e-2d4b-4f7a-9d1e-3b6c8a2f4e10',
      status: 'candidate_ready',
      intent: { ...READY_SESSION.intent, popularity: 'rarities' },
      preservation: { firstTracks: 5, positions: [8], artists: ['Radiohead'] },
      notApplied: [{ category: 'activity', userText: 'for running' }],
      candidate: CANDIDATE,
      diff: DIFF,
    },
  };

  it('accepts a ready candidate with its preview and deterministic diff', () => {
    expect(AiRefinementResultSchema.parse(PROPOSED)).toEqual(PROPOSED);
  });

  it('accepts a failed candidate with a normalized generation error only', () => {
    const { candidate: _candidate, diff: _diff, ...proposal } =
      PROPOSED.refinement;
    const failed = {
      ...PROPOSED,
      refinement: {
        ...proposal,
        status: 'candidate_failed',
        error: {
          code: 'SPOTIFY_RATE_LIMITED',
          category: 'provider_rate_limited',
          retryAfterSeconds: 30,
          seedNotFound: null,
        },
      },
    };

    expect(AiRefinementResultSchema.parse(failed)).toEqual(failed);
    expect(
      AiRefinementResultSchema.safeParse({
        ...failed,
        refinement: {
          ...failed.refinement,
          error: { ...failed.refinement.error, providerResponse: {} },
        },
      }).success,
    ).toBe(false);
  });

  it('restores a pending candidate next to the applied preview', () => {
    const state = {
      ...READY_SESSION,
      execution: {
        status: 'generated',
        ...CANDIDATE,
        transferAvailable: false,
      },
      destination: null,
      preservation: {
        firstTracks: 2,
        positions: [5],
        artists: ['Radiohead'],
        preservedPositions: [1, 2, 4, 5],
      },
      refinement: PROPOSED.refinement,
    };

    expect(AiSessionStateSchema.parse(state)).toEqual(state);
  });

  it('identifies every pending refinement with an opaque id only', () => {
    const { id: _id, ...withoutId } = PROPOSED.refinement;

    expect(
      AiRefinementResultSchema.safeParse({ ...PROPOSED, refinement: withoutId })
        .success,
    ).toBe(false);
    for (const id of ['', 'a'.repeat(AI_REFINEMENT_ID_MAX_LENGTH + 1), 'a/b', 'a b']) {
      expect(
        AiRefinementResultSchema.safeParse({
          ...PROPOSED,
          refinement: { ...PROPOSED.refinement, id },
        }).success,
      ).toBe(false);
    }
    expect(AiRefinementIdSchema.safeParse(PROPOSED.refinement.id).success).toBe(true);
  });

  it('keeps the current preservation to constraints and effective positions', () => {
    const current = {
      firstTracks: null,
      positions: [2],
      artists: [],
      preservedPositions: [2],
    };

    expect(AiCurrentPreservationSchema.parse(current)).toEqual(current);
    expect(
      AiCurrentPreservationSchema.safeParse({ ...current, trackIds: ['x'] }).success,
    ).toBe(false);
    expect(
      AiCurrentPreservationSchema.safeParse({
        ...current,
        preservedPositions: [MAX_TRACKS + 1],
      }).success,
    ).toBe(false);
  });

  it.each([
    ['the execution plan', { executionPlan: {} }],
    ['the lease or attempt', { attemptId: 'attempt-1' }],
    ['the raw model patch', { patch: {} }],
    ['the refinement text', { refinement: 'Make it less mainstream' }],
    ['candidate pool scores', { candidatePool: [{ id: 'x', score: 1 }] }],
  ])('keeps %s out of the refinement result', (_label, extra) => {
    const result = AiRefinementResultSchema.safeParse({
      ...PROPOSED,
      refinement: { ...PROPOSED.refinement, ...extra },
    });

    expect(result.success).toBe(false);
  });

  it('keeps transfer and recipe details out of the candidate preview', () => {
    for (const candidate of [
      { ...CANDIDATE, transferAvailable: true },
      { ...CANDIDATE, recipe: {} },
    ]) {
      expect(
        AiRefinementResultSchema.safeParse({
          ...PROPOSED,
          refinement: { ...PROPOSED.refinement, candidate },
        }).success,
      ).toBe(false);
    }
  });

  it('bounds diff positions and rejects unknown intent change fields', () => {
    const withTracks = (tracks: object) => ({
      ...PROPOSED,
      refinement: {
        ...PROPOSED.refinement,
        diff: { ...DIFF, tracks: { ...DIFF.tracks, ...tracks } },
      },
    });

    expect(
      AiRefinementResultSchema.safeParse(
        withTracks({ added: [{ trackId: 'x', position: MAX_TRACKS + 1 }] }),
      ).success,
    ).toBe(false);
    expect(
      AiRefinementResultSchema.safeParse(
        withTracks({ moved: [{ trackId: 'x', from: 0, to: 1 }] }),
      ).success,
    ).toBe(false);
    expect(
      AiRefinementResultSchema.safeParse({
        ...PROPOSED,
        refinement: {
          ...PROPOSED.refinement,
          diff: { ...DIFF, intent: [{ field: 'title', from: 'a', to: 'b' }] },
        },
      }).success,
    ).toBe(false);
  });

  it('accepts a preserved artist that is not in the current playlist as a clarification reason', () => {
    expect(AI_REFINEMENT_CLARIFICATION_REASONS).toContain(
      'preserved_artist_not_found',
    );
  });

  it('accepts a refinement clarification without offering options', () => {
    const clarification = {
      ...PROPOSED,
      refinement: {
        id: 'clarification-1',
        status: 'needs_clarification',
        clarification: {
          reason: 'conflicting_changes',
          seedType: null,
          limit: null,
          names: ['Coldplay'],
          unsupportedConstraints: [],
        },
      },
    };

    expect(AiRefinementResultSchema.safeParse(clarification).success).toBe(true);
    expect(
      AiRefinementResultSchema.safeParse({
        ...clarification,
        refinement: {
          ...clarification.refinement,
          clarification: { ...clarification.refinement.clarification, options: [] },
        },
      }).success,
    ).toBe(false);
  });

  it('accepts an unchanged refinement', () => {
    expect(
      AiRefinementResultSchema.safeParse({
        ...PROPOSED,
        refinement: { id: 'unchanged-1', status: 'unchanged' },
      }).success,
    ).toBe(true);
  });

  it('bounds preserved positions by the playlist track limit', () => {
    const withPosition = (position: number) => ({
      ...PROPOSED,
      refinement: {
        ...PROPOSED.refinement,
        preservation: { firstTracks: null, positions: [position], artists: [] },
      },
    });

    expect(AiRefinementResultSchema.safeParse(withPosition(MAX_TRACKS)).success).toBe(true);
    expect(AiRefinementResultSchema.safeParse(withPosition(MAX_TRACKS + 1)).success).toBe(
      false,
    );
    expect(AiRefinementResultSchema.safeParse(withPosition(0)).success).toBe(false);
  });

  it('accepts only bounded refinement text in the public request', () => {
    const atLimit = 'a'.repeat(AI_REFINEMENT_MAX_LENGTH);

    expect(AI_REFINEMENT_TEXT_MAX_LENGTH).toBe(AI_REFINEMENT_MAX_LENGTH);
    expect(CreateAiRefinementRequestSchema.safeParse({ refinement: atLimit }).success).toBe(
      true,
    );
    expect(
      CreateAiRefinementRequestSchema.safeParse({ refinement: `${atLimit}a` }).success,
    ).toBe(false);
    expect(CreateAiRefinementRequestSchema.safeParse({ refinement: '  ' }).success).toBe(
      false,
    );
    expect(
      CreateAiRefinementRequestSchema.safeParse({
        refinement: 'Remove Coldplay',
        positions: [1, 2],
      }).success,
    ).toBe(false);
  });

  it('accepts only bounded 1-based positions as explicit preservation changes', () => {
    const request = (preservePositions: unknown) =>
      CreateAiRefinementRequestSchema.safeParse({
        refinement: 'Remove Coldplay',
        preservePositions,
      }).success;

    expect(request({ add: [1, MAX_TRACKS], remove: [3] })).toBe(true);
    expect(request({ add: [0], remove: [] })).toBe(false);
    expect(request({ add: [MAX_TRACKS + 1], remove: [] })).toBe(false);
    expect(request({ add: [1.5], remove: [] })).toBe(false);
    expect(request({ add: [1] })).toBe(false);
    expect(request({ add: [], remove: [], trackIds: ['spotify:track:1'] })).toBe(false);
    expect(
      request({ add: Array.from({ length: MAX_TRACKS + 1 }, () => 1), remove: [] }),
    ).toBe(false);
  });
});

describe('AiGenerationFailureSchema wait origin', () => {
  const failure = {
    code: 'SPOTIFY_RATE_LIMITED',
    category: 'provider_rate_limited',
    retryAfterSeconds: 30,
    seedNotFound: null,
  };

  it.each(['spotify', 'blendify', null, undefined])(
    'accepts a wait origin of %s',
    (retryAfterSource) => {
      expect(
        AiGenerationFailureSchema.safeParse({ ...failure, retryAfterSource }).success,
      ).toBe(true);
    },
  );

  it('rejects an unknown wait origin', () => {
    expect(
      AiGenerationFailureSchema.safeParse({ ...failure, retryAfterSource: 'proxy' }).success,
    ).toBe(false);
  });
});
