import type { RefinementInterpretation } from '@blendify/contracts/ai-service';
import type { AiIntent } from './ai-intent';
import {
  EMPTY_AI_PRESERVATION,
  type AiIntentPatch,
  type AiPreservation,
  type AiPreservationPatch,
} from './ai-intent-patch';
import { evaluateRefinement } from './ai-refinement';

const NO_NAMES = { add: [], remove: [] };
const PLAYLIST_TRACK_COUNT = 30;

function intent(overrides: Partial<AiIntent> = {}): AiIntent {
  return {
    kind: 'artist_mix',
    artists: ['Radiohead', 'Interpol'],
    genres: [],
    seedTracks: [],
    targetTrackCount: 30,
    targetDurationMinutes: null,
    mood: null,
    popularity: 'balanced',
    orderMode: null,
    excludeArtists: [],
    excludeTracks: [],
    unsupportedConstraints: [],
    ...overrides,
  };
}

function interpreted(
  patch: Partial<AiIntentPatch> = {},
  options: {
    preservation?: Partial<AiPreservationPatch>;
    unsupported?: Array<{
      category: 'activity' | 'energy' | 'era' | 'other';
      userText: string;
    }>;
  } = {},
): RefinementInterpretation {
  return {
    outcome: 'interpreted',
    patch: {
      kind: null,
      artists: NO_NAMES,
      genres: NO_NAMES,
      seedTracks: NO_NAMES,
      targetTrackCount: null,
      targetDurationMinutes: null,
      mood: null,
      popularity: null,
      orderMode: null,
      excludeArtists: NO_NAMES,
      excludeTracks: NO_NAMES,
      ...patch,
    },
    preservation: {
      firstTracks: null,
      positions: { add: [], remove: [] },
      artists: NO_NAMES,
      ...options.preservation,
    },
    unsupportedConstraints: options.unsupported ?? [],
  };
}

function evaluate(
  interpretation: RefinementInterpretation,
  current: AiIntent = intent(),
  preservation: AiPreservation = EMPTY_AI_PRESERVATION,
) {
  return evaluateRefinement({
    intent: current,
    preservation,
    interpretation,
    playlistTrackCount: PLAYLIST_TRACK_COUNT,
  });
}

function clarificationReason(result: ReturnType<typeof evaluate>) {
  return result.status === 'needs_clarification'
    ? result.clarification.reason
    : result.status;
}

describe('evaluateRefinement', () => {
  it('proposes the next AI-safe intent and preservation for an executable patch', () => {
    const result = evaluate(
      interpreted(
        {
          popularity: { operation: 'set', value: 'rarities' },
          artists: { add: [], remove: ['Interpol'] },
        },
        { preservation: { firstTracks: { operation: 'set', value: 5 } } },
      ),
    );

    expect(result).toEqual({
      status: 'proposed',
      intent: intent({ artists: ['Radiohead'], popularity: 'rarities' }),
      preservation: { firstTracks: 5, positions: [], artists: [] },
      notApplied: [],
    });
  });

  it('applies the executable part and reports deferred constraints as not applied', () => {
    const result = evaluate(
      interpreted(
        { targetTrackCount: { operation: 'set', value: 20 } },
        { unsupported: [{ category: 'activity', userText: 'for running' }] },
      ),
    );

    expect(result).toEqual({
      status: 'proposed',
      intent: intent({ targetTrackCount: 20 }),
      preservation: EMPTY_AI_PRESERVATION,
      notApplied: [{ category: 'activity', userText: 'for running' }],
    });
  });

  it('keeps the current state for a refinement that only asks for unsupported things', () => {
    const result = evaluate(
      interpreted(
        {},
        { unsupported: [{ category: 'activity', userText: 'for running' }] },
      ),
    );

    expect(result).toEqual({
      status: 'needs_clarification',
      clarification: {
        reason: 'unsupported_constraint',
        seedType: null,
        limit: null,
        names: [],
        unsupportedConstraints: [
          { category: 'activity', userText: 'for running' },
        ],
      },
    });
  });

  it('never partially applies a refinement that needs an ordering Blendify cannot execute', () => {
    const result = evaluate(
      interpreted(
        { popularity: { operation: 'set', value: 'rarities' } },
        {
          unsupported: [
            { category: 'energy', userText: 'build up the energy' },
          ],
        },
      ),
    );

    expect(clarificationReason(result)).toBe('unsupported_constraint');
  });

  it('reports an already satisfied refinement as unchanged', () => {
    const current = intent({ popularity: 'rarities' });

    expect(
      evaluate(
        interpreted({ popularity: { operation: 'set', value: 'rarities' } }),
        current,
      ),
    ).toEqual({ status: 'unchanged' });
    expect(evaluate(interpreted(), current)).toEqual({ status: 'unchanged' });
  });

  it('forwards a model clarification without changing anything', () => {
    const result = evaluate({
      outcome: 'needs_clarification',
      clarification: {
        reason: 'ambiguous_request',
        unsupportedConstraints: [
          { category: 'duration', userText: 'make it shorter' },
        ],
      },
    });

    expect(result).toEqual({
      status: 'needs_clarification',
      clarification: {
        reason: 'ambiguous_request',
        seedType: null,
        limit: null,
        names: [],
        unsupportedConstraints: [
          { category: 'duration', userText: 'make it shorter' },
        ],
      },
    });
  });

  it('asks for clarification when the same refinement adds and removes a value', () => {
    const result = evaluate(
      interpreted({
        excludeArtists: { add: ['Coldplay'], remove: ['Coldplay'] },
      }),
    );

    expect(result).toMatchObject({
      status: 'needs_clarification',
      clarification: { reason: 'conflicting_changes', names: ['Coldplay'] },
    });
  });

  it.each([
    [
      'too many seeds for a discovery playlist',
      interpreted({ artists: { add: ['Portishead'], remove: [] } }),
      intent({ kind: 'discover_artist', artists: ['Radiohead'] }),
      'too_many_seeds',
    ],
    [
      'artists and genres at once',
      interpreted({ genres: { add: ['shoegaze'], remove: [] } }),
      intent(),
      'mixed_seed_types',
    ],
    [
      'a track count above the playlist limit',
      interpreted({ targetTrackCount: { operation: 'set', value: 60 } }),
      intent(),
      'track_count_over_limit',
    ],
    [
      'a zero duration',
      interpreted({ targetDurationMinutes: { operation: 'set', value: 0 } }),
      intent(),
      'invalid_duration',
    ],
    [
      'a genre outside the curated catalog',
      interpreted({ genres: { add: ['not-a-real-genre'], remove: [] } }),
      intent({ kind: 'genre_mix', artists: [], genres: ['shoegaze'] }),
      'unknown_genres',
    ],
    [
      'a style too broad to execute without truncation',
      interpreted({ genres: { add: ['acoustic'], remove: [] } }),
      intent({ kind: 'genre_mix', artists: [], genres: ['shoegaze'] }),
      'ambiguous_genres',
    ],
    [
      'a curated broad style that no longer fits beside the current genres',
      interpreted({ genres: { add: ['instrumental'], remove: [] } }),
      intent({ kind: 'genre_mix', artists: [], genres: ['shoegaze'] }),
      'ambiguous_genres',
    ],
    [
      'removing every seed',
      interpreted({ artists: { add: [], remove: ['Radiohead', 'Interpol'] } }),
      intent(),
      'ambiguous_request',
    ],
  ])(
    'keeps domain limits by asking for clarification on %s',
    (_label, change, current, reason) => {
      expect(clarificationReason(evaluate(change, current))).toBe(reason);
    },
  );

  it('derives the playlist kind from the patched seeds', () => {
    const result = evaluate(
      interpreted({
        artists: { add: [], remove: ['Radiohead', 'Interpol'] },
        genres: { add: ['shoegaze'], remove: [] },
      }),
    );

    expect(result).toMatchObject({
      status: 'proposed',
      intent: { kind: 'genre_mix', artists: [], genres: ['shoegaze'] },
    });
  });

  it('rejects preserved tracks beyond the current playlist', () => {
    const beyond = evaluate(
      interpreted(
        {},
        {
          preservation: {
            positions: { add: [PLAYLIST_TRACK_COUNT + 1], remove: [] },
          },
        },
      ),
    );
    const firstTracks = evaluate(
      interpreted(
        {},
        { preservation: { firstTracks: { operation: 'set', value: 31 } } },
      ),
    );
    const last = evaluate(
      interpreted(
        {},
        {
          preservation: {
            positions: { add: [PLAYLIST_TRACK_COUNT], remove: [] },
          },
        },
      ),
    );

    expect(beyond).toMatchObject({
      status: 'needs_clarification',
      clarification: {
        reason: 'preserved_track_out_of_range',
        limit: PLAYLIST_TRACK_COUNT,
      },
    });
    expect(clarificationReason(firstTracks)).toBe(
      'preserved_track_out_of_range',
    );
    expect(last.status).toBe('proposed');
  });

  it('never mutates the current intent, even when the refinement is rejected', () => {
    const current = intent();
    const snapshot = structuredClone(current);

    evaluate(
      interpreted({ targetTrackCount: { operation: 'set', value: 60 } }),
      current,
    );
    evaluate(
      interpreted({ artists: { add: ['Portishead'], remove: ['Interpol'] } }),
      current,
    );

    expect(current).toEqual(snapshot);
  });
});

describe('genre refinement through the deterministic curated resolver', () => {
  const genreIntent = (genres: string[]) =>
    intent({ kind: 'genre_mix', artists: [], genres });

  it('adds a semantic genre expression that resolves to a curated genre', () => {
    expect(
      evaluate(
        interpreted({ genres: { add: ['argentine rock'], remove: [] } }),
        genreIntent(['indie rock']),
      ),
    ).toMatchObject({
      status: 'proposed',
      intent: { genres: ['indie rock', 'argentine rock'] },
    });
  });

  it('removes a genre by its canonical curated identity', () => {
    expect(
      evaluate(
        interpreted({ genres: { add: [], remove: ['Argentine-Rock'] } }),
        genreIntent(['argentine rock', 'indie rock']),
      ),
    ).toMatchObject({
      status: 'proposed',
      intent: { genres: ['indie rock'] },
    });
    expect(
      evaluate(
        interpreted({ genres: { add: [], remove: ['Indie Rock'] } }),
        genreIntent(['argentine rock', 'indie rock']),
      ),
    ).toMatchObject({
      status: 'proposed',
      intent: { genres: ['argentine rock'] },
    });
  });

  it('treats adding a genre already present under another spelling as unchanged', () => {
    expect(
      evaluate(
        interpreted({ genres: { add: ['Argentine Rock'], remove: [] } }),
        genreIntent(['argentine rock']),
      ),
    ).toEqual({ status: 'unchanged' });
  });

  it('removes a local genre named by its English form', () => {
    expect(
      evaluate(
        interpreted({ genres: { add: [], remove: ['Argentine pop'] } }),
        genreIntent(['pop argentino', 'indie rock']),
      ),
    ).toMatchObject({
      status: 'proposed',
      intent: { genres: ['indie rock'] },
    });
  });

  it('treats adding the English form of a present local genre as unchanged', () => {
    expect(
      evaluate(
        interpreted({ genres: { add: ['argentine trap'], remove: [] } }),
        genreIntent(['trap argentino']),
      ),
    ).toEqual({ status: 'unchanged' });
  });

  it('swaps a genre for instrumental music through its curated genres', () => {
    expect(
      evaluate(
        interpreted({ genres: { add: ['instrumental'], remove: ['rock'] } }),
        genreIntent(['rock']),
      ),
    ).toMatchObject({
      status: 'proposed',
      intent: { genres: ['instrumental'] },
    });
  });

  it('flags adding and removing the same canonical genre as a conflict', () => {
    expect(
      evaluate(
        interpreted({
          genres: { add: ['argentine-rock'], remove: ['Argentine Rock'] },
        }),
        genreIntent(['argentine rock', 'indie rock']),
      ),
    ).toMatchObject({
      status: 'needs_clarification',
      clarification: { reason: 'conflicting_changes' },
    });
  });
});
