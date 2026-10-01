import { MAX_TRACKS } from '@/domain/constants';
import { Track } from '@/domain/track/track.entity';
import { ArtistId } from '@/domain/value-objects/artist-id.vo';
import { TrackId } from '@/domain/value-objects/track-id.vo';
import type { AiIntent } from './ai-intent';
import {
  assembleRefinementCandidate,
  fillCandidateTrackCount,
  refinementArrangement,
  refinementStrategy,
  type AiRefinementAssemblyInput,
  type AiRefinementStrategy,
} from './ai-refinement-candidate';

const MINUTE_MS = 60_000;

function track(id: string, artist: string, minutes = 4): Track {
  return Track.create({
    id: TrackId.create(id),
    name: `Song ${id}`,
    artistId: ArtistId.create(`artist-${artist}`),
    artistName: artist,
    durationMs: minutes * MINUTE_MS,
    popularity: 50,
    uri: `spotify:track:${id}`,
  });
}

function intent(overrides: Partial<AiIntent> = {}): AiIntent {
  return {
    kind: 'artist_mix',
    artists: ['Radiohead', 'Interpol'],
    genres: [],
    seedTracks: [],
    filters: { region: null },
    targetTrackCount: null,
    targetDurationMinutes: null,
    mood: null,
    popularity: null,
    orderMode: null,
    excludeArtists: [],
    excludeTracks: [],
    unsupportedConstraints: [],
    ...overrides,
  };
}

const CURRENT = [
  track('r1', 'Radiohead'),
  track('i1', 'Interpol'),
  track('r2', 'Radiohead'),
  track('c1', 'Coldplay'),
  track('i2', 'Interpol'),
  track('r3', 'Radiohead'),
];

function ids(tracks: readonly Track[]): string[] {
  return tracks.map((item) => item.id.getValue());
}

function strategyFor(proposed: Partial<AiIntent>, current = intent()) {
  return refinementStrategy({
    current,
    proposed: intent(proposed),
    currentTracks: CURRENT,
  });
}

function assemble(
  overrides: Partial<AiRefinementAssemblyInput> & { intent?: AiIntent },
) {
  return assembleRefinementCandidate({
    currentTracks: CURRENT,
    preservedPositions: [],
    strategy: { kind: 'transform' },
    generatedTracks: [],
    intent: intent(),
    arrangement: 'keep',
    random: () => 0,
    ...overrides,
  });
}

function assembled(input: Parameters<typeof assemble>[0]): string[] {
  const result = assemble(input);
  if (result.status !== 'assembled') {
    throw new Error(`Expected an assembled candidate, got ${result.status}`);
  }
  return ids(result.tracks);
}

describe('refinementStrategy', () => {
  it.each<[string, Partial<AiIntent>, AiRefinementStrategy['kind']]>([
    ['an order-only change', { orderMode: 'artist' }, 'transform'],
    ['a count decrease', { targetTrackCount: 3 }, 'transform'],
    [
      'a count that the current tracks already meet',
      { targetTrackCount: 6 },
      'transform',
    ],
    ['a count increase', { targetTrackCount: 10 }, 'retain_and_fill'],
    [
      'an exclusion that removes current tracks',
      { excludeArtists: ['Coldplay'] },
      'retain_and_fill',
    ],
    [
      'an exclusion that matches nothing',
      { excludeArtists: ['Muse'] },
      'transform',
    ],
    ['a mood on an artist mix', { mood: 'calm' }, 'transform'],
    [
      'a duration the current tracks exceed',
      { targetDurationMinutes: 12 },
      'transform',
    ],
    [
      'a duration above the current tracks',
      { targetDurationMinutes: 60 },
      'retain_and_fill',
    ],
    ['a popularity change', { popularity: 'rarities' }, 'regenerate'],
    [
      'an explicit balanced popularity',
      { popularity: 'balanced' },
      'transform',
    ],
    [
      'an added artist seed',
      { artists: ['Radiohead', 'Interpol', 'Muse'] },
      'regenerate',
    ],
    [
      'a kind change',
      { kind: 'discover_artist', artists: ['Radiohead'] },
      'regenerate',
    ],
  ])('selects %s', (_label, proposed, kind) => {
    expect(strategyFor(proposed).kind).toBe(kind);
  });

  it('keeps the tracks of the remaining seeds when an artist seed is removed', () => {
    expect(strategyFor({ artists: ['Radiohead'] })).toEqual({
      kind: 'retain_and_fill',
      droppedArtists: ['Interpol'],
    });
  });

  it('regenerates when an artist seed is removed together with a popularity change', () => {
    expect(
      strategyFor({ artists: ['Radiohead'], popularity: 'popular' }).kind,
    ).toBe('regenerate');
  });

  it('treats a removed exclusion as still satisfied by the current tracks', () => {
    expect(strategyFor({}, intent({ excludeArtists: ['Coldplay'] })).kind).toBe(
      'transform',
    );
  });

  it('never refills a previous shortfall on an order-only change', () => {
    const current = intent({ targetTrackCount: 20 });

    expect(
      strategyFor({ targetTrackCount: 20, orderMode: 'title' }, current).kind,
    ).toBe('transform');
  });

  describe('genre and mood mixes', () => {
    const genreMix = intent({
      kind: 'genre_mix',
      artists: [],
      genres: ['rock'],
    });

    it.each<[string, Partial<AiIntent>, AiRefinementStrategy['kind']]>([
      [
        'a genre alias for the same catalog genre',
        { genres: ['Rock'] },
        'transform',
      ],
      ['an added genre', { genres: ['rock', 'argentine rock'] }, 'regenerate'],
      ['a removed genre', { genres: ['argentine rock'] }, 'regenerate'],
      ['an instrumental family', { genres: ['instrumental'] }, 'regenerate'],
      [
        'a mood next to explicit genres',
        { genres: ['rock'], mood: 'calm' },
        'transform',
      ],
    ])('selects %s', (_label, proposed, kind) => {
      expect(
        refinementStrategy({
          current: genreMix,
          proposed: { ...genreMix, ...proposed },
          currentTracks: CURRENT,
        }).kind,
      ).toBe(kind);
    });

    it('regenerates a mood-only mix whose mood changes its curated genres', () => {
      const moodOnly = intent({
        kind: 'genre_mix',
        artists: [],
        mood: 'calm',
      });

      expect(
        refinementStrategy({
          current: moodOnly,
          proposed: { ...moodOnly, mood: 'energetic' },
          currentTracks: CURRENT,
        }).kind,
      ).toBe('regenerate');
    });
  });
});

describe('fillCandidateTrackCount', () => {
  it('asks only for the tracks missing next to the kept ones', () => {
    expect(
      fillCandidateTrackCount(intent({ targetTrackCount: 10 }), 6, 6),
    ).toBe(4);
    expect(fillCandidateTrackCount(intent(), 5, 6)).toBe(1);
    expect(
      fillCandidateTrackCount(intent({ targetTrackCount: 50 }), 40, 40),
    ).toBe(10);
  });

  it('asks for a full duration pool, since kept tracks are never generated again', () => {
    expect(
      fillCandidateTrackCount(intent({ targetDurationMinutes: 60 }), 10, 12),
    ).toBe(30);
    expect(
      fillCandidateTrackCount(intent({ targetDurationMinutes: 600 }), 10, 12),
    ).toBe(MAX_TRACKS);
  });
});

describe('refinementArrangement', () => {
  it('uses the deterministic sort of the proposed mode', () => {
    expect(
      refinementArrangement(intent(), intent({ orderMode: 'title' }), {
        kind: 'transform',
      }),
    ).toBe('title');
  });

  it('shuffles only when random order is newly requested over current tracks', () => {
    const sorted = intent({ orderMode: 'artist' });

    expect(
      refinementArrangement(sorted, intent({ orderMode: 'random' }), {
        kind: 'transform',
      }),
    ).toBe('random');
    expect(
      refinementArrangement(intent(), intent({ targetTrackCount: 3 }), {
        kind: 'transform',
      }),
    ).toBe('keep');
    expect(
      refinementArrangement(sorted, intent({ orderMode: 'random' }), {
        kind: 'regenerate',
      }),
    ).toBe('keep');
  });
});

describe('assembleRefinementCandidate', () => {
  it('keeps the current playlist when nothing about its tracks changes', () => {
    expect(assembled({})).toEqual(ids(CURRENT));
  });

  it('never mutates the current tracks', () => {
    const before = [...CURRENT];

    assemble({ arrangement: 'title', intent: intent({ targetTrackCount: 2 }) });

    expect(CURRENT).toEqual(before);
  });

  it('reorders the current tracks for an order-only change', () => {
    expect(assembled({ arrangement: 'artist' })).toEqual([
      'c1',
      'i1',
      'i2',
      'r1',
      'r2',
      'r3',
    ]);
  });

  it('shuffles with the injected random source', () => {
    const first = assembled({ arrangement: 'random', random: () => 0.42 });
    const second = assembled({ arrangement: 'random', random: () => 0.42 });

    expect(first).toEqual(second);
    expect([...first].sort()).toEqual([...ids(CURRENT)].sort());
  });

  it('trims by M2 keep-priority and keeps the survivors in their current order', () => {
    expect(assembled({ intent: intent({ targetTrackCount: 3 }) })).toEqual([
      'r1',
      'i1',
      'c1',
    ]);
  });

  it('never drops preserved tracks when trimming', () => {
    expect(
      assembled({
        intent: intent({ targetTrackCount: 3 }),
        preservedPositions: [3],
      }),
    ).toEqual(['r1', 'i1', 'r2']);
  });

  it('removes excluded tracks and fills the gap from the generated pool', () => {
    expect(
      assembled({
        strategy: { kind: 'retain_and_fill', droppedArtists: [] },
        intent: intent({ excludeArtists: ['Coldplay'] }),
        generatedTracks: [
          track('r1', 'Radiohead'),
          track('c9', 'Coldplay'),
          track('r4', 'Radiohead'),
          track('r5', 'Radiohead'),
        ],
      }),
    ).toEqual(['r1', 'i1', 'r2', 'i2', 'r3', 'r4']);
  });

  it('drops the tracks of a removed artist seed and fills from the proposed seeds', () => {
    expect(
      assembled({
        strategy: { kind: 'retain_and_fill', droppedArtists: ['Interpol'] },
        intent: intent({ artists: ['Radiohead'] }),
        generatedTracks: [track('r4', 'Radiohead'), track('r5', 'Radiohead')],
      }),
    ).toEqual(['r1', 'r2', 'c1', 'r3', 'r4', 'r5']);
  });

  it('adds only the missing tracks for a count increase', () => {
    expect(
      assembled({
        strategy: { kind: 'retain_and_fill', droppedArtists: [] },
        intent: intent({ targetTrackCount: 8 }),
        generatedTracks: [
          ...CURRENT,
          track('r4', 'Radiohead'),
          track('i3', 'Interpol'),
          track('r5', 'Radiohead'),
        ],
      }),
    ).toEqual([...ids(CURRENT), 'r4', 'i3']);
  });

  it('returns the best valid candidate when the pool cannot reach the count', () => {
    expect(
      assembled({
        strategy: { kind: 'retain_and_fill', droppedArtists: [] },
        intent: intent({ targetTrackCount: 10 }),
        generatedTracks: [track('r4', 'Radiohead')],
      }),
    ).toHaveLength(7);
  });

  it('keeps preserved tracks at their exact positions over a fresh generation', () => {
    const result = assembled({
      strategy: { kind: 'regenerate' },
      preservedPositions: [1, 5],
      intent: intent({ popularity: 'rarities', targetTrackCount: 6 }),
      generatedTracks: ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'].map((id) =>
        track(id, `Artist ${id}`),
      ),
    });

    expect(result).toEqual(['r1', 'n1', 'n2', 'n3', 'i2', 'n4']);
  });

  it('keeps the preserved copy only once when the generation returns it again', () => {
    const result = assembled({
      strategy: { kind: 'regenerate' },
      preservedPositions: [2],
      intent: intent({ targetTrackCount: 3 }),
      generatedTracks: [
        track('i1', 'Interpol'),
        track('n1', 'A'),
        track('n2', 'B'),
      ],
    });

    expect(result).toEqual(['n1', 'i1', 'n2']);
    expect(new Set(result).size).toBe(result.length);
  });

  it('never keeps an excluded generated track', () => {
    expect(
      assembled({
        strategy: { kind: 'regenerate' },
        intent: intent({ excludeArtists: ['Coldplay'] }),
        generatedTracks: [track('n1', 'A'), track('c9', 'Coldplay')],
      }),
    ).toEqual(['n1']);
  });

  it('sizes a fresh generation without a count like M2 would', () => {
    expect(
      assembled({
        strategy: { kind: 'regenerate' },
        preservedPositions: [1],
        generatedTracks: ['n1', 'n2', 'n3'].map((id) => track(id, id)),
      }),
    ).toEqual(['r1', 'n1', 'n2']);
  });

  it('keeps preserved tracks even when they make the duration unmet', () => {
    const long = [track('l1', 'Long', 30), track('l2', 'Long', 30)];

    expect(
      assembleRefinementCandidate({
        currentTracks: long,
        preservedPositions: [1, 2],
        strategy: { kind: 'transform' },
        generatedTracks: [],
        intent: intent({ targetDurationMinutes: 20 }),
        arrangement: 'keep',
        random: () => 0,
      }),
    ).toMatchObject({ status: 'assembled', tracks: long });
  });

  it('trims to the closest duration prefix after the preserved tracks', () => {
    expect(
      assembled({
        intent: intent({ targetDurationMinutes: 12 }),
        preservedPositions: [6],
      }),
    ).toEqual(['r1', 'i1', 'r2', 'c1', 'i2', 'r3']);
    expect(
      assembled({ intent: intent({ targetDurationMinutes: 12 }) }),
    ).toEqual(['r1', 'i1', 'c1']);
  });

  it('reports a conflict when fixed positions break a requested global order', () => {
    expect(
      assemble({ arrangement: 'artist', preservedPositions: [1] }),
    ).toEqual({ status: 'order_conflict' });
    expect(assemble({ arrangement: 'title', preservedPositions: [4] })).toEqual(
      { status: 'order_conflict' },
    );
  });

  it('keeps fixed positions under random order and shuffles only the movable tracks', () => {
    const result = assembled({
      arrangement: 'random',
      preservedPositions: [2],
      random: () => 0.9,
    });

    expect(result[1]).toBe('i1');
    expect([...result].sort()).toEqual([...ids(CURRENT)].sort());
  });

  it('accepts fixed positions that already fit the requested order', () => {
    expect(
      assembled({ arrangement: 'artist', preservedPositions: [6] }),
    ).toEqual(['c1', 'i1', 'i2', 'r1', 'r2', 'r3']);
  });

  it('reports a preserved position the candidate cannot reach', () => {
    expect(
      assemble({
        strategy: { kind: 'regenerate' },
        preservedPositions: [5],
        generatedTracks: [track('n1', 'A')],
      }),
    ).toEqual({ status: 'insufficient', reason: 'unfilled_positions' });
  });

  it('reports an empty candidate', () => {
    expect(
      assemble({
        strategy: { kind: 'regenerate' },
        generatedTracks: [track('c9', 'Coldplay')],
        intent: intent({ excludeArtists: ['Coldplay'] }),
      }),
    ).toEqual({ status: 'insufficient', reason: 'no_tracks' });
  });

  it('never exceeds MAX_TRACKS', () => {
    const many = Array.from({ length: MAX_TRACKS }, (_, index) =>
      track(`g${index}`, `A${index}`),
    );

    const result = assemble({
      currentTracks: many,
      strategy: { kind: 'retain_and_fill', droppedArtists: [] },
      intent: intent({ targetDurationMinutes: 600 }),
      generatedTracks: Array.from({ length: MAX_TRACKS }, (_, index) =>
        track(`x${index}`, `B${index}`),
      ),
    });

    expect(result.status === 'assembled' && result.tracks.length).toBe(
      MAX_TRACKS,
    );
  });
});
