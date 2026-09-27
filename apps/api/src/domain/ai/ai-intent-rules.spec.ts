import { MAX_ARTISTS, MAX_GENRES, MAX_TRACKS } from '@/domain/constants';
import { constraintCapability } from './ai-capability-matrix';
import { clarificationOptionId, type AiIntent } from './ai-intent';
import {
  applyClarificationOption,
  clarificationFromModel,
  findIntentClarification,
  normalizeAiIntent,
} from './ai-intent-rules';

function intent(overrides: Partial<AiIntent> = {}): AiIntent {
  return {
    kind: 'artist_mix',
    artists: ['Radiohead', 'Interpol'],
    genres: [],
    seedTracks: [],
    targetTrackCount: 30,
    targetDurationMinutes: null,
    mood: null,
    popularity: 'rarities',
    orderMode: null,
    excludeArtists: ['Coldplay'],
    excludeTracks: [],
    unsupportedConstraints: [],
    ...overrides,
  };
}

function names(count: number, prefix: string): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`);
}

describe('AI capability matrix', () => {
  it.each(['energy', 'tempo', 'progression'] as const)(
    'offers an ordering alternative for %s',
    (category) => {
      expect(constraintCapability(category)).toBe('needs_clarification');
    },
  );

  it.each([
    'duration',
    'era',
    'mood',
    'activity',
    'artist_attribute',
    'other',
  ] as const)('defers %s as an unmet constraint', (category) => {
    expect(constraintCapability(category)).toBe('deferred');
  });
});

describe('normalizeAiIntent', () => {
  it('removes duplicate names without reordering them', () => {
    const normalized = normalizeAiIntent(
      intent({
        artists: ['Radiohead', 'radiohead ', 'Interpol'],
        excludeArtists: ['Coldplay', 'COLDPLAY'],
      }),
    );

    expect(normalized.artists).toEqual(['Radiohead', 'Interpol']);
    expect(normalized.excludeArtists).toEqual(['Coldplay']);
  });

  it('aligns the kind with the only seed type present', () => {
    expect(normalizeAiIntent(intent({ kind: 'genre_mix' })).kind).toBe(
      'artist_mix',
    );
    expect(
      normalizeAiIntent(
        intent({
          kind: 'discover_artist',
          artists: [],
          seedTracks: [{ title: 'Teardrop', artist: null }],
        }),
      ).kind,
    ).toBe('discover_track');
  });

  it('treats a mood-only request as a genre-based playlist', () => {
    const normalized = normalizeAiIntent(
      intent({ kind: 'artist_mix', artists: [], mood: 'happy' }),
    );

    expect(normalized).toMatchObject({
      kind: 'genre_mix',
      genres: [],
      mood: 'happy',
    });
  });

  it('keeps explicit genres and the mood as separate values', () => {
    const request = intent({
      kind: 'genre_mix',
      artists: [],
      genres: ['pop'],
      mood: 'happy',
    });

    expect(normalizeAiIntent(request)).toMatchObject({
      kind: 'genre_mix',
      genres: ['pop'],
      mood: 'happy',
    });
    expect(findIntentClarification(normalizeAiIntent(request))).toBeNull();
  });

  it('keeps the seed kind when a mood comes with an artist or track seed', () => {
    expect(
      normalizeAiIntent(intent({ kind: 'genre_mix', mood: 'sad' })),
    ).toMatchObject({ kind: 'artist_mix', mood: 'sad' });
    expect(
      normalizeAiIntent(
        intent({
          kind: 'artist_mix',
          artists: [],
          seedTracks: [{ title: 'Teardrop', artist: 'Massive Attack' }],
          mood: 'dark',
        }),
      ),
    ).toMatchObject({ kind: 'discover_track', mood: 'dark' });
  });

  it('keeps the requested kind when seed types are mixed', () => {
    const mixed = intent({ kind: 'genre_mix', genres: ['indie rock'] });

    expect(normalizeAiIntent(mixed).kind).toBe('genre_mix');
  });
});

describe('findIntentClarification', () => {
  it('accepts a request within every product limit', () => {
    expect(findIntentClarification(intent())).toBeNull();
  });

  it('asks for detail when no seed was named', () => {
    expect(findIntentClarification(intent({ artists: [] }))?.reason).toBe(
      'ambiguous_request',
    );
  });

  it('reports unsupported-only requests without inventing seeds', () => {
    const constraints = [
      { category: 'activity' as const, userText: 'for a long run' },
    ];

    const clarification = findIntentClarification(
      intent({ artists: [], unsupportedConstraints: constraints }),
    );

    expect(clarification).toMatchObject({
      reason: 'unsupported_constraint',
      unsupportedConstraints: constraints,
      options: [],
    });
  });

  it('asks which seed type to use instead of creating a hybrid mode', () => {
    const clarification = findIntentClarification(
      intent({ genres: ['bossa nova'] }),
    );

    expect(clarification?.reason).toBe('mixed_seed_types');
    expect(clarification?.options).toEqual([
      { type: 'set_kind', kind: 'artist_mix' },
      { type: 'set_kind', kind: 'genre_mix' },
    ]);
  });

  it('reports too many artists for a mix using the domain limit', () => {
    const artists = names(MAX_ARTISTS + 2, 'Artist');

    const clarification = findIntentClarification(intent({ artists }));

    expect(clarification).toMatchObject({
      reason: 'too_many_seeds',
      seedType: 'artist',
      limit: MAX_ARTISTS,
      names: artists,
      options: [],
    });
  });

  it('reports too many genres for a genre mix', () => {
    const clarification = findIntentClarification(
      intent({
        kind: 'genre_mix',
        artists: [],
        genres: names(MAX_GENRES + 1, 'Genre'),
      }),
    );

    expect(clarification).toMatchObject({
      reason: 'too_many_seeds',
      seedType: 'genre',
      limit: MAX_GENRES,
    });
  });

  it('offers to pick one artist or switch to a mix for Discover', () => {
    const clarification = findIntentClarification(
      intent({ kind: 'discover_artist' }),
    );

    expect(clarification?.reason).toBe('too_many_seeds');
    expect(clarification?.limit).toBe(1);
    expect(clarification?.options).toEqual([
      { type: 'keep_seed', seedType: 'artist', index: 0, label: 'Radiohead' },
      { type: 'keep_seed', seedType: 'artist', index: 1, label: 'Interpol' },
      { type: 'set_kind', kind: 'artist_mix' },
    ]);
  });

  it('never silently truncates an over-limit track count', () => {
    const clarification = findIntentClarification(
      intent({ targetTrackCount: 200 }),
    );

    expect(clarification).toMatchObject({
      reason: 'track_count_over_limit',
      limit: MAX_TRACKS,
      options: [{ type: 'set_track_count', trackCount: MAX_TRACKS }],
    });
  });

  it('offers existing order modes for an energy progression', () => {
    const energy = { category: 'energy' as const, userText: 'more energetic' };

    const clarification = findIntentClarification(
      intent({ unsupportedConstraints: [energy] }),
    );

    expect(clarification?.reason).toBe('unsupported_ordering');
    expect(clarification?.unsupportedConstraints).toEqual([energy]);
    expect(clarification?.options.map((option) => option.type)).toEqual([
      'set_order_mode',
      'set_order_mode',
      'set_order_mode',
    ]);
  });

  it('accepts a mood-only request without asking for an artist, song or genre', () => {
    expect(
      findIntentClarification(
        intent({ kind: 'genre_mix', artists: [], mood: 'happy' }),
      ),
    ).toBeNull();
  });

  it('keeps a mood request executable when its activity is not supported', () => {
    expect(
      findIntentClarification(
        intent({
          kind: 'genre_mix',
          artists: [],
          mood: 'happy',
          unsupportedConstraints: [
            { category: 'activity', userText: 'to dance at a party' },
          ],
        }),
      ),
    ).toBeNull();
  });

  it('still asks when only an activity was stated', () => {
    expect(
      findIntentClarification(
        intent({
          kind: 'genre_mix',
          artists: [],
          unsupportedConstraints: [
            { category: 'activity', userText: 'for my workout' },
          ],
        }),
      )?.reason,
    ).toBe('unsupported_constraint');
  });

  it('applies domain limits to a mood-only request', () => {
    expect(
      findIntentClarification(
        intent({
          kind: 'genre_mix',
          artists: [],
          mood: 'calm',
          targetTrackCount: MAX_TRACKS + 1,
        }),
      )?.reason,
    ).toBe('track_count_over_limit');
  });

  it('accepts a target duration together with a track count', () => {
    expect(
      findIntentClarification(
        intent({ targetTrackCount: 30, targetDurationMinutes: 60 }),
      ),
    ).toBeNull();
  });

  it('asks the user to fix a zero duration instead of guessing one', () => {
    expect(
      findIntentClarification(
        intent({
          kind: 'genre_mix',
          artists: [],
          genres: ['jazz'],
          targetDurationMinutes: 0,
        }),
      ),
    ).toMatchObject({ reason: 'invalid_duration', options: [] });
  });

  it('validates genres against the local curated catalog', () => {
    expect(
      findIntentClarification(
        intent({ kind: 'genre_mix', artists: [], genres: ['Pop', 'shoegaze'] }),
      ),
    ).toBeNull();
    expect(
      findIntentClarification(
        intent({
          kind: 'genre_mix',
          artists: [],
          genres: ['shoegaze', 'definitely not a genre', 'custom:anything'],
        }),
      ),
    ).toMatchObject({
      reason: 'unknown_genres',
      seedType: 'genre',
      names: ['definitely not a genre', 'custom:anything'],
    });
  });

  it('never asks whether a named artist or song exists', () => {
    expect(
      findIntentClarification(
        intent({ artists: ['Radiohed', 'Nobody Known'] }),
      ),
    ).toBeNull();
    expect(
      findIntentClarification(
        intent({
          kind: 'discover_track',
          artists: [],
          seedTracks: [{ title: 'Imaginary Song', artist: 'Nobody Known' }],
        }),
      ),
    ).toBeNull();
  });

  it('does not block on deferred constraints or an already chosen order', () => {
    expect(
      findIntentClarification(
        intent({
          orderMode: 'artist',
          unsupportedConstraints: [
            { category: 'tempo', userText: 'fast songs' },
            { category: 'mood', userText: 'sad' },
          ],
        }),
      ),
    ).toBeNull();
  });
});

describe('applyClarificationOption', () => {
  it('keeps only the seeds of the chosen kind', () => {
    const applied = applyClarificationOption(
      intent({ genres: ['bossa nova'] }),
      { type: 'set_kind', kind: 'genre_mix' },
    );

    expect(applied).toMatchObject({
      kind: 'genre_mix',
      artists: [],
      genres: ['bossa nova'],
    });
    expect(findIntentClarification(applied)).toBeNull();
  });

  it('keeps the chosen Discover seed', () => {
    const applied = applyClarificationOption(
      intent({ kind: 'discover_artist' }),
      { type: 'keep_seed', seedType: 'artist', index: 1, label: 'Interpol' },
    );

    expect(applied.artists).toEqual(['Interpol']);
    expect(findIntentClarification(applied)).toBeNull();
  });

  it('applies the offered count and order', () => {
    const counted = applyClarificationOption(
      intent({ targetTrackCount: 200 }),
      {
        type: 'set_track_count',
        trackCount: MAX_TRACKS,
      },
    );
    const ordered = applyClarificationOption(intent(), {
      type: 'set_order_mode',
      orderMode: 'title',
    });

    expect(counted.targetTrackCount).toBe(MAX_TRACKS);
    expect(ordered.orderMode).toBe('title');
  });
});

describe('clarification options and model clarifications', () => {
  it('builds stable option ids', () => {
    expect(
      clarificationOptionId({
        type: 'keep_seed',
        seedType: 'track',
        index: 2,
        label: 'Teardrop',
      }),
    ).toBe('keep_seed:track:2');
    expect(clarificationOptionId({ type: 'set_kind', kind: 'genre_mix' })).toBe(
      'set_kind:genre_mix',
    );
  });

  it('keeps a model clarification without options', () => {
    expect(
      clarificationFromModel({
        reason: 'not_a_playlist_request',
        unsupportedConstraints: [],
      }),
    ).toEqual({
      reason: 'not_a_playlist_request',
      seedType: null,
      limit: null,
      names: [],
      unsupportedConstraints: [],
      options: [],
    });
  });
});
