import type { AiIntent } from './ai-intent';
import {
  applyIntentPatch,
  applyPreservationPatch,
  conflictingPatchLabels,
  EMPTY_AI_PRESERVATION,
  type AiIntentPatch,
  type AiPreservationPatch,
} from './ai-intent-patch';

const NO_NAMES = { add: [], remove: [] };

function intent(overrides: Partial<AiIntent> = {}): AiIntent {
  return {
    kind: 'artist_mix',
    artists: ['Radiohead', 'Interpol'],
    genres: [],
    seedTracks: [],
    targetTrackCount: 30,
    targetDurationMinutes: null,
    mood: 'dark',
    popularity: 'balanced',
    orderMode: null,
    excludeArtists: ['Coldplay'],
    excludeTracks: [{ title: 'Creep', artist: 'Radiohead' }],
    unsupportedConstraints: [{ category: 'era', userText: '90s' }],
    ...overrides,
  };
}

function patch(overrides: Partial<AiIntentPatch> = {}): AiIntentPatch {
  return {
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
    ...overrides,
  };
}

function preservationPatch(
  overrides: Partial<AiPreservationPatch> = {},
): AiPreservationPatch {
  return {
    firstTracks: null,
    positions: { add: [], remove: [] },
    artists: NO_NAMES,
    ...overrides,
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('applyIntentPatch', () => {
  it('keeps every field the patch leaves unchanged', () => {
    const current = intent();

    expect(applyIntentPatch(current, patch())).toEqual(current);
  });

  it('sets and clears single values without touching the other fields', () => {
    const next = applyIntentPatch(
      intent(),
      patch({
        popularity: { operation: 'set', value: 'rarities' },
        mood: { operation: 'clear' },
        targetTrackCount: { operation: 'set', value: 20 },
      }),
    );

    expect(next).toEqual(
      intent({ popularity: 'rarities', mood: null, targetTrackCount: 20 }),
    );
  });

  it('never lets the patch change the unsupported constraints of the intent', () => {
    const next = applyIntentPatch(
      intent(),
      patch({ popularity: { operation: 'set', value: 'popular' } }),
    );

    expect(next.unsupportedConstraints).toEqual([
      { category: 'era', userText: '90s' },
    ]);
  });

  it('removes only the requested names, matched by normalized name', () => {
    const next = applyIntentPatch(
      intent({ artists: ['Radiohead', 'Interpol', 'Joy Division'] }),
      patch({ artists: { add: [], remove: ['  interpol ', 'Björk'] } }),
    );

    expect(next.artists).toEqual(['Radiohead', 'Joy Division']);
  });

  it('merges additions after the kept names and drops normalized duplicates', () => {
    const next = applyIntentPatch(
      intent(),
      patch({
        artists: { add: ['radiohead', 'Portishead', 'PORTISHEAD'], remove: [] },
        excludeArtists: { add: ['Muse'], remove: ['coldplay'] },
      }),
    );

    expect(next.artists).toEqual(['Radiohead', 'Interpol', 'Portishead']);
    expect(next.excludeArtists).toEqual(['Muse']);
  });

  it('removes a song by title when the patch names no artist, and exactly otherwise', () => {
    const current = intent({
      excludeTracks: [
        { title: 'Creep', artist: 'Radiohead' },
        { title: 'Creep', artist: 'TLC' },
        { title: 'Yellow', artist: 'Coldplay' },
      ],
    });

    const anyArtist = applyIntentPatch(
      current,
      patch({
        excludeTracks: { add: [], remove: [{ title: 'creep', artist: null }] },
      }),
    );
    const exact = applyIntentPatch(
      current,
      patch({
        excludeTracks: {
          add: [],
          remove: [{ title: 'Creep', artist: 'TLC' }],
        },
      }),
    );

    expect(anyArtist.excludeTracks).toEqual([
      { title: 'Yellow', artist: 'Coldplay' },
    ]);
    expect(exact.excludeTracks).toEqual([
      { title: 'Creep', artist: 'Radiohead' },
      { title: 'Yellow', artist: 'Coldplay' },
    ]);
  });

  it('sets the playlist kind only when the patch asks for it', () => {
    expect(applyIntentPatch(intent(), patch()).kind).toBe('artist_mix');
    expect(
      applyIntentPatch(
        intent(),
        patch({ kind: { operation: 'set', value: 'discover_artist' } }),
      ).kind,
    ).toBe('discover_artist');
  });

  it('never mutates the current intent or the patch', () => {
    const current = deepFreeze(intent());
    const change = deepFreeze(
      patch({
        artists: { add: ['Portishead'], remove: ['Interpol'] },
        popularity: { operation: 'set', value: 'rarities' },
      }),
    );

    const next = applyIntentPatch(current, change);

    expect(next).not.toBe(current);
    expect(current).toEqual(intent());
  });
});

describe('applyPreservationPatch', () => {
  it('keeps the current preservation when the patch changes nothing', () => {
    const current = { firstTracks: 5, positions: [8], artists: ['Radiohead'] };

    expect(applyPreservationPatch(current, preservationPatch())).toEqual(
      current,
    );
  });

  it('merges positions as a sorted unique set and removes only requested ones', () => {
    const next = applyPreservationPatch(
      { firstTracks: null, positions: [9, 2], artists: [] },
      preservationPatch({ positions: { add: [4, 2, 7], remove: [9] } }),
    );

    expect(next.positions).toEqual([2, 4, 7]);
  });

  it('sets and clears the first kept tracks and deduplicates kept artists', () => {
    const next = applyPreservationPatch(
      EMPTY_AI_PRESERVATION,
      preservationPatch({
        firstTracks: { operation: 'set', value: 5 },
        artists: { add: ['Radiohead', 'radiohead'], remove: [] },
      }),
    );
    const cleared = applyPreservationPatch(
      next,
      preservationPatch({ firstTracks: { operation: 'clear' } }),
    );

    expect(next).toEqual({
      firstTracks: 5,
      positions: [],
      artists: ['Radiohead'],
    });
    expect(cleared.firstTracks).toBeNull();
    expect(EMPTY_AI_PRESERVATION).toEqual({
      firstTracks: null,
      positions: [],
      artists: [],
    });
  });
});

describe('conflictingPatchLabels', () => {
  it('reports a value that the same refinement both adds and removes', () => {
    expect(
      conflictingPatchLabels(
        patch({
          artists: { add: ['Coldplay'], remove: ['coldplay'] },
          seedTracks: {
            add: [{ title: 'Teardrop', artist: null }],
            remove: [{ title: 'Teardrop', artist: null }],
          },
        }),
        preservationPatch({ positions: { add: [3], remove: [3] } }),
      ),
    ).toEqual(['Coldplay', 'Teardrop', '3']);
  });

  it('accepts moving a name from the seeds to the exclusions', () => {
    expect(
      conflictingPatchLabels(
        patch({
          artists: { add: [], remove: ['Coldplay'] },
          excludeArtists: { add: ['Coldplay'], remove: [] },
        }),
        preservationPatch(),
      ),
    ).toEqual([]);
  });
});
