import type { RefinementInterpretation } from '@blendify/contracts/ai-service';
import type { AiIntent } from './ai-intent';
import {
  EMPTY_AI_PRESERVATION,
  type AiIntentPatch,
  type AiPreservation,
  type AiPreservationPatch,
} from './ai-intent-patch';
import { resolveAiGenreSeeds } from './ai-genre-seeds';
import { evaluateRefinement } from './ai-refinement';

const NO_NAMES = { add: [], remove: [] };
const NO_FILTER_CHANGES: AiIntentPatch['filters'] = {
  region: null,
  femaleVocals: null,
  releaseRange: null,
  excludeLive: null,
};
const PLAYLIST_TRACK_COUNT = 30;

function intent(overrides: Partial<AiIntent> = {}): AiIntent {
  return {
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
      category:
        | 'activity'
        | 'duration'
        | 'energy'
        | 'era'
        | 'genre_exclusion'
        | 'other';
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
      filters: NO_FILTER_CHANGES,
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
      'a genre outside the genre catalog',
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
      'a broad style that no longer fits beside the current genres',
      interpreted({ genres: { add: ['acoustic'], remove: [] } }),
      intent({ kind: 'genre_mix', artists: [], genres: ['shoegaze'] }),
      'ambiguous_genres',
    ],
    [
      'a second region beside the current regional genre',
      interpreted({ genres: { add: ['argentine rock'], remove: [] } }),
      intent({ kind: 'genre_mix', artists: [], genres: ['brazilian pop'] }),
      'conflicting_regions',
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

describe('genre refinement through the deterministic canonical genre resolver', () => {
  const genreIntent = (genres: string[]) =>
    intent({ kind: 'genre_mix', artists: [], genres });

  it('adds a semantic genre expression that resolves to a catalog genre', () => {
    expect(
      evaluate(
        interpreted({ genres: { add: ['argentine rock'], remove: [] } }),
        genreIntent(['indie rock']),
      ),
    ).toMatchObject({
      status: 'proposed',
      intent: {
        genres: ['indie rock', 'rock'],
        filters: { region: 'argentina' },
      },
    });
  });

  it('removes a genre by its canonical identity', () => {
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
      intent: { genres: ['rock'], filters: { region: 'argentina' } },
    });
  });

  it('moves the current genres to the UK region named by a prepositional refinement', () => {
    const result = evaluate(
      interpreted({
        genres: {
          add: ['pop de UK', 'rock de UK', 'r&b de UK'],
          remove: ['pop', 'rock', 'r&b'],
        },
      }),
      genreIntent(['pop', 'rock', 'r&b']),
    );

    expect(result).toMatchObject({
      status: 'proposed',
      intent: {
        genres: ['pop', 'rock', 'r&b'],
        filters: { region: 'british' },
      },
    });
    expect(
      result.status === 'proposed' && resolveAiGenreSeeds(result.intent.genres),
    ).toMatchObject({
      genres: [{ id: 'pop' }, { id: 'rock' }, { id: 'r&b' }],
    });
  });

  it('adds a plural regional genre through the same resolver as the initial request', () => {
    const result = evaluate(
      interpreted({ genres: { add: ['rancheras mexicanas'], remove: [] } }),
      genreIntent(['corrido tumbado']),
    );

    expect(result).toMatchObject({
      status: 'proposed',
      intent: {
        genres: ['corrido tumbado', 'rancheras'],
        filters: { region: 'mexico' },
      },
    });
    expect(
      result.status === 'proposed' && resolveAiGenreSeeds(result.intent.genres),
    ).toMatchObject({
      genres: [{ id: 'corrido tumbado' }, { id: 'ranchera' }],
    });
  });

  it('treats adding the plural of a present genre as unchanged', () => {
    expect(
      evaluate(
        interpreted({ genres: { add: ['corridos tumbados'], remove: [] } }),
        genreIntent(['corrido tumbado']),
      ),
    ).toEqual({ status: 'unchanged' });
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

  it('adds a local-language genre expression through its localized alias', () => {
    expect(
      evaluate(
        interpreted({ genres: { add: ['rock argentino'], remove: [] } }),
        genreIntent(['indie rock']),
      ),
    ).toMatchObject({
      status: 'proposed',
      intent: {
        genres: ['indie rock', 'rock'],
        filters: { region: 'argentina' },
      },
    });
    expect(
      evaluate(
        interpreted({ genres: { add: ['jazz brasileiro'], remove: [] } }),
        genreIntent(['indie rock']),
      ),
    ).toMatchObject({
      status: 'proposed',
      intent: {
        genres: ['indie rock', 'jazz'],
        filters: { region: 'brazilian' },
      },
    });
  });

  it('removes a genre named by its local-language alias', () => {
    expect(
      evaluate(
        interpreted({ genres: { add: [], remove: ['rock argentino'] } }),
        genreIntent(['argentine rock', 'indie rock']),
      ),
    ).toMatchObject({
      status: 'proposed',
      intent: { genres: ['indie rock'] },
    });
  });

  it('treats adding the local-language alias of a present genre as unchanged', () => {
    expect(
      evaluate(
        interpreted({ genres: { add: ['jazz brasileiro'], remove: [] } }),
        genreIntent(['brazilian jazz']),
      ),
    ).toEqual({ status: 'unchanged' });
  });

  it('swaps a genre for instrumental music through its catalog genres', () => {
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
  describe('explicitly selected positions', () => {
    function evaluateWithSelection(
      interpretation: RefinementInterpretation,
      explicitPositions: { add: number[]; remove: number[] },
      preservation: AiPreservation = EMPTY_AI_PRESERVATION,
    ) {
      return evaluateRefinement({
        intent: intent(),
        preservation,
        interpretation,
        playlistTrackCount: PLAYLIST_TRACK_COUNT,
        explicitPositions,
      });
    }

    it('adds selected positions to the proposed preservation next to the written patch', () => {
      const outcome = evaluateWithSelection(
        interpreted(
          { popularity: { operation: 'set', value: 'rarities' } },
          { preservation: { positions: { add: [5], remove: [] } } },
        ),
        { add: [2, 5], remove: [] },
      );

      expect(outcome).toMatchObject({
        status: 'proposed',
        preservation: { firstTracks: null, positions: [2, 5], artists: [] },
      });
    });

    it('proposes a selection-only change even when the text changes nothing', () => {
      expect(
        evaluateWithSelection(
          interpreted(),
          { add: [], remove: [3] },
          {
            ...EMPTY_AI_PRESERVATION,
            positions: [3, 4],
          },
        ),
      ).toMatchObject({
        status: 'proposed',
        intent: intent(),
        preservation: { positions: [4] },
      });
    });

    it('never lets the selection silently override the written refinement', () => {
      expect(
        evaluateWithSelection(
          interpreted(
            {},
            { preservation: { positions: { add: [], remove: [2] } } },
          ),
          { add: [2], remove: [] },
          { ...EMPTY_AI_PRESERVATION, positions: [2] },
        ),
      ).toEqual({
        status: 'needs_clarification',
        clarification: expect.objectContaining({
          reason: 'conflicting_changes',
          names: ['2'],
        }) as object,
      });
    });

    it('rejects a selected position beyond the current playlist', () => {
      expect(
        evaluateWithSelection(interpreted(), {
          add: [PLAYLIST_TRACK_COUNT + 1],
          remove: [],
        }),
      ).toMatchObject({
        status: 'needs_clarification',
        clarification: {
          reason: 'preserved_track_out_of_range',
          limit: PLAYLIST_TRACK_COUNT,
        },
      });
    });

    it('ignores the selection when the model asks for clarification', () => {
      expect(
        evaluateWithSelection(
          {
            outcome: 'needs_clarification',
            clarification: {
              reason: 'ambiguous_request',
              unsupportedConstraints: [],
            },
          },
          { add: [1], remove: [] },
        ),
      ).toMatchObject({
        status: 'needs_clarification',
        clarification: { reason: 'ambiguous_request' },
      });
    });
  });
});

describe('genre versus artist exclusion', () => {
  it('never turns a genre name into an excluded artist', () => {
    const result = evaluate(
      interpreted({ excludeArtists: { add: ['rock'], remove: [] } }),
    );

    expect(result).toEqual({
      status: 'needs_clarification',
      clarification: {
        reason: 'unsupported_constraint',
        seedType: null,
        limit: null,
        names: [],
        unsupportedConstraints: [
          { category: 'genre_exclusion', userText: 'rock' },
        ],
      },
    });
  });

  it('keeps excluding a named artist', () => {
    expect(
      evaluate(
        interpreted({
          excludeArtists: { add: ['Taylor Swift'], remove: [] },
        }),
      ),
    ).toMatchObject({
      status: 'proposed',
      intent: { excludeArtists: ['Taylor Swift'] },
    });
  });

  it('refuses a reported genre exclusion instead of claiming it was applied', () => {
    const result = evaluate(
      interpreted(
        {},
        {
          unsupported: [{ category: 'genre_exclusion', userText: 'sin rock' }],
        },
      ),
    );

    expect(result).toMatchObject({
      status: 'needs_clarification',
      clarification: {
        reason: 'unsupported_constraint',
        unsupportedConstraints: [
          { category: 'genre_exclusion', userText: 'sin rock' },
        ],
      },
    });
  });

  it('applies nothing when a genre exclusion comes with executable changes', () => {
    const result = evaluate(
      interpreted(
        { popularity: { operation: 'set', value: 'rarities' } },
        {
          unsupported: [{ category: 'genre_exclusion', userText: 'sin rock' }],
        },
      ),
    );

    expect(clarificationReason(result)).toBe('unsupported_constraint');
  });

  it('does not promise to keep an artist while excluding a genre it cannot verify', () => {
    const result = evaluate(
      interpreted(
        {},
        {
          preservation: { artists: { add: ['Dua Lipa'], remove: [] } },
          unsupported: [{ category: 'genre_exclusion', userText: 'sin pop' }],
        },
      ),
    );

    expect(clarificationReason(result)).toBe('unsupported_constraint');
  });

  it('still removes a genre that is a seed of the current request', () => {
    const current = intent({
      kind: 'genre_mix',
      artists: [],
      genres: ['rock', 'jazz'],
    });

    expect(
      evaluate(interpreted({ genres: { add: [], remove: ['rock'] } }), current),
    ).toMatchObject({ status: 'proposed', intent: { genres: ['jazz'] } });
  });
});

describe('relative duration', () => {
  const adjust = (deltaMinutes: number) =>
    interpreted({
      targetDurationMinutes: { operation: 'adjust', deltaMinutes },
    });

  it('adds minutes to the persisted target', () => {
    expect(
      evaluate(
        adjust(10),
        intent({ targetTrackCount: null, targetDurationMinutes: 30 }),
      ),
    ).toMatchObject({
      status: 'proposed',
      intent: { targetDurationMinutes: 40 },
    });
  });

  it('removes minutes from the persisted target', () => {
    expect(
      evaluate(
        adjust(-10),
        intent({ targetTrackCount: null, targetDurationMinutes: 30 }),
      ),
    ).toMatchObject({
      status: 'proposed',
      intent: { targetDurationMinutes: 20 },
    });
  });

  it('is not idempotent: repeating it moves the target again', () => {
    const current = intent({
      targetTrackCount: null,
      targetDurationMinutes: 30,
    });
    const first = evaluate(adjust(10), current);
    if (first.status !== 'proposed') {
      throw new Error('expected a proposal');
    }

    expect(evaluate(adjust(10), first.intent)).toMatchObject({
      status: 'proposed',
      intent: { targetDurationMinutes: 50 },
    });
  });

  it('asks for a length when the request has no duration target to move', () => {
    expect(
      evaluate(adjust(10), intent({ targetDurationMinutes: null })),
    ).toMatchObject({
      status: 'needs_clarification',
      clarification: { reason: 'ambiguous_request' },
    });
  });

  it.each([
    ['below the minimum', -30],
    ['under zero', -45],
    ['above the maximum', 10_080],
  ])('refuses a target %s instead of clamping it', (_label, deltaMinutes) => {
    const current = intent({
      targetTrackCount: null,
      targetDurationMinutes: 30,
    });

    expect(evaluate(adjust(deltaMinutes), current)).toMatchObject({
      status: 'needs_clarification',
      clarification: { reason: 'invalid_duration' },
    });
  });

  it('treats a zero adjustment as unchanged', () => {
    expect(
      evaluate(
        adjust(0),
        intent({ targetTrackCount: null, targetDurationMinutes: 30 }),
      ),
    ).toEqual({ status: 'unchanged' });
  });

  it('composes with other changes in the same refinement', () => {
    const result = evaluate(
      interpreted({
        targetDurationMinutes: { operation: 'adjust', deltaMinutes: 10 },
        excludeArtists: { add: ['Coldplay'], remove: [] },
      }),
      intent({ targetTrackCount: null, targetDurationMinutes: 30 }),
    );

    expect(result).toMatchObject({
      status: 'proposed',
      intent: { targetDurationMinutes: 40, excludeArtists: ['Coldplay'] },
    });
  });
});

describe('effective state comparison', () => {
  it('proposes excluding an artist the playlist does not contain, because the rule is persisted', () => {
    expect(
      evaluate(
        interpreted({ excludeArtists: { add: ['Coldplay'], remove: [] } }),
      ),
    ).toMatchObject({
      status: 'proposed',
      intent: { excludeArtists: ['Coldplay'] },
    });
  });

  it('reports an exclusion that is already active as unchanged, whatever its spelling', () => {
    const current = intent({ excludeArtists: ['Coldplay'] });

    expect(
      evaluate(
        interpreted({ excludeArtists: { add: ['coldplay'], remove: [] } }),
        current,
      ),
    ).toEqual({ status: 'unchanged' });
  });

  it('reports setting a preference to its default as unchanged', () => {
    const current = intent({ popularity: null, orderMode: null });

    expect(
      evaluate(
        interpreted({
          popularity: { operation: 'set', value: 'balanced' },
          orderMode: { operation: 'set', value: 'random' },
        }),
        current,
      ),
    ).toEqual({ status: 'unchanged' });
  });

  it('reports keeping an already kept position as unchanged', () => {
    const preservation = { firstTracks: null, positions: [2], artists: [] };

    expect(
      evaluate(
        interpreted(
          {},
          { preservation: { positions: { add: [2], remove: [] } } },
        ),
        intent(),
        preservation,
      ),
    ).toEqual({ status: 'unchanged' });
  });
});

describe('region filter refinement', () => {
  const setRegion = (value: string) =>
    interpreted({
      filters: { ...NO_FILTER_CHANGES, region: { operation: 'set', value } },
    });
  const clearRegion = interpreted({
    filters: { ...NO_FILTER_CHANGES, region: { operation: 'clear' } },
  });
  const regional = (seeds: Partial<AiIntent>, region: string | null) =>
    intent({
      artists: [],
      ...seeds,
      filters: {
        region,
        femaleVocals: false,
        releaseRange: null,
        excludeLive: false,
      },
    });

  describe.each<[string, Partial<AiIntent>]>([
    ['genre_mix', { kind: 'genre_mix', genres: ['rock'] }],
    ['discover_artist', { kind: 'discover_artist', artists: ['Radiohead'] }],
    [
      'discover_track',
      {
        kind: 'discover_track',
        seedTracks: [{ title: 'Creep', artist: 'Radiohead' }],
      },
    ],
  ])('on a %s', (_kind, seeds) => {
    it('sets a region from user-language text', () => {
      expect(
        evaluate(setRegion('argentina'), regional(seeds, null)),
      ).toMatchObject({
        status: 'proposed',
        intent: { ...seeds, filters: { region: 'argentina' } },
      });
    });

    it('replaces the current region', () => {
      expect(
        evaluate(setRegion('Brasil'), regional(seeds, 'argentina')),
      ).toMatchObject({
        status: 'proposed',
        intent: { filters: { region: 'brazilian' } },
      });
      expect(
        evaluate(setRegion('UK'), regional(seeds, 'brazilian')),
      ).toMatchObject({
        status: 'proposed',
        intent: { filters: { region: 'british' } },
      });
    });

    it('clears the region', () => {
      expect(evaluate(clearRegion, regional(seeds, 'argentina'))).toMatchObject(
        { status: 'proposed', intent: { filters: { region: null } } },
      );
    });

    it('treats the same region in other words as unchanged', () => {
      expect(
        evaluate(setRegion('argentino'), regional(seeds, 'argentina')),
      ).toEqual({ status: 'unchanged' });
    });

    it('asks for another region when the requested one is not curated', () => {
      expect(
        clarificationReason(
          evaluate(setRegion('japonés'), regional(seeds, null)),
        ),
      ).toBe('unknown_region');
    });
  });

  it('replaces the region of a genre mix whose region came from its genres', () => {
    expect(
      evaluate(
        setRegion('Brasil'),
        intent({ kind: 'genre_mix', artists: [], genres: ['rock argentino'] }),
      ),
    ).toMatchObject({
      status: 'proposed',
      intent: { genres: ['rock'], filters: { region: 'brazilian' } },
    });
  });

  it('never applies a region refinement to an artist mix', () => {
    expect(
      evaluate(setRegion('Argentina'), intent({ kind: 'artist_mix' })),
    ).toMatchObject({
      status: 'needs_clarification',
      clarification: { reason: 'region_not_supported', names: ['argentina'] },
    });
  });

  it('never keeps a region when the refinement turns the playlist into an artist mix', () => {
    expect(
      clarificationReason(
        evaluate(
          interpreted({ kind: { operation: 'set', value: 'artist_mix' } }),
          regional(
            { kind: 'discover_artist', artists: ['Radiohead'] },
            'argentina',
          ),
        ),
      ),
    ).toBe('region_not_supported');
  });
});

describe('vocal, release and live filter refinements', () => {
  const patchFilters = (filters: Partial<AiIntentPatch['filters']>) =>
    interpreted({ filters: { ...NO_FILTER_CHANGES, ...filters } });
  const filtered = (
    seeds: Partial<AiIntent>,
    filters: Partial<AiIntent['filters']> = {},
  ) =>
    intent({
      artists: [],
      ...seeds,
      filters: {
        region: null,
        femaleVocals: false,
        releaseRange: null,
        excludeLive: false,
        ...filters,
      },
    });
  const NINETIES = { fromYear: 1990, toYear: 1999 };
  const TWO_THOUSANDS = { fromYear: 2000, toYear: 2009 };

  describe.each<[string, Partial<AiIntent>]>([
    ['genre_mix', { kind: 'genre_mix', genres: ['rock'] }],
    ['discover_artist', { kind: 'discover_artist', artists: ['Radiohead'] }],
    [
      'discover_track',
      {
        kind: 'discover_track',
        seedTracks: [{ title: 'Creep', artist: 'Radiohead' }],
      },
    ],
  ])('on a %s', (_kind, seeds) => {
    it('sets and clears female vocals', () => {
      expect(
        evaluate(
          patchFilters({ femaleVocals: { operation: 'set', value: true } }),
          filtered(seeds),
        ),
      ).toMatchObject({
        status: 'proposed',
        intent: { filters: { femaleVocals: true } },
      });
      expect(
        evaluate(
          patchFilters({ femaleVocals: { operation: 'clear' } }),
          filtered(seeds, { femaleVocals: true }),
        ),
      ).toMatchObject({
        status: 'proposed',
        intent: { filters: { femaleVocals: false } },
      });
    });

    it('sets, replaces and clears the release range', () => {
      expect(
        evaluate(
          patchFilters({ releaseRange: { operation: 'set', value: NINETIES } }),
          filtered(seeds),
        ),
      ).toMatchObject({
        status: 'proposed',
        intent: { filters: { releaseRange: NINETIES } },
      });
      expect(
        evaluate(
          patchFilters({
            releaseRange: { operation: 'set', value: TWO_THOUSANDS },
          }),
          filtered(seeds, { releaseRange: NINETIES }),
        ),
      ).toMatchObject({
        status: 'proposed',
        intent: { filters: { releaseRange: TWO_THOUSANDS } },
      });
      expect(
        evaluate(
          patchFilters({ releaseRange: { operation: 'clear' } }),
          filtered(seeds, { releaseRange: NINETIES }),
        ),
      ).toMatchObject({
        status: 'proposed',
        intent: { filters: { releaseRange: null } },
      });
    });

    it('sets and clears live exclusion', () => {
      expect(
        evaluate(
          patchFilters({ excludeLive: { operation: 'set', value: true } }),
          filtered(seeds),
        ),
      ).toMatchObject({
        status: 'proposed',
        intent: { filters: { excludeLive: true } },
      });
      expect(
        evaluate(
          patchFilters({ excludeLive: { operation: 'clear' } }),
          filtered(seeds, { excludeLive: true }),
        ),
      ).toMatchObject({
        status: 'proposed',
        intent: { filters: { excludeLive: false } },
      });
    });

    it('treats a repeated filter as unchanged', () => {
      expect(
        evaluate(
          patchFilters({ excludeLive: { operation: 'set', value: true } }),
          filtered(seeds, { excludeLive: true }),
        ),
      ).toEqual({ status: 'unchanged' });
    });

    it('asks again for a reversed release range', () => {
      expect(
        clarificationReason(
          evaluate(
            patchFilters({
              releaseRange: {
                operation: 'set',
                value: { fromYear: 2005, toYear: 1995 },
              },
            }),
            filtered(seeds),
          ),
        ),
      ).toBe('invalid_release_range');
    });
  });

  it('never applies female vocals to the artists of an artist mix', () => {
    expect(
      evaluate(
        patchFilters({ femaleVocals: { operation: 'set', value: true } }),
        intent({ kind: 'artist_mix', artists: ['Radiohead'] }),
      ),
    ).toMatchObject({
      status: 'needs_clarification',
      clarification: { reason: 'female_vocals_not_supported' },
    });
  });

  it('applies release and live filters to an artist mix', () => {
    expect(
      evaluate(
        patchFilters({
          releaseRange: { operation: 'set', value: NINETIES },
          excludeLive: { operation: 'set', value: true },
        }),
        intent({ kind: 'artist_mix', artists: ['Radiohead'] }),
      ),
    ).toMatchObject({
      status: 'proposed',
      intent: {
        kind: 'artist_mix',
        artists: ['Radiohead'],
        filters: { releaseRange: NINETIES, excludeLive: true },
      },
    });
  });
});
