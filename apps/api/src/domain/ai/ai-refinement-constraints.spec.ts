import type { AiGenerationUnmetConstraint } from '@blendify/contracts';
import type { AiIntent } from './ai-intent';
import { unsatisfiedRefinementConstraints } from './ai-refinement-constraints';
import type { AiGenerationResult } from './ai-session';

const MINUTE_MS = 60_000;

const INTENT: AiIntent = {
  kind: 'artist_mix',
  artists: ['Ed Sheeran'],
  genres: [],
  seedTracks: [],
  targetTrackCount: null,
  targetDurationMinutes: 30,
  mood: null,
  popularity: null,
  orderMode: null,
  excludeArtists: [],
  excludeTracks: [],
  unsupportedConstraints: [],
};

function result(input: {
  trackCount: number;
  minutes: number;
  unmet?: AiGenerationUnmetConstraint[];
}): AiGenerationResult {
  return {
    playlist: {
      name: 'Blendify · Mix',
      description: 'Made with Blendify.',
      seeds: [],
      tracks: Array.from({ length: input.trackCount }, (_, index) => ({
        id: `t${index}`,
        name: `Song ${index}`,
        artistId: 'artist',
        artistName: 'Artist',
        durationMs: 0,
        popularity: 50,
        uri: `spotify:track:t${index}`,
      })),
    },
    recipe: {
      version: 1,
      kind: 'artist_mix',
      tracksPerSeed: 10,
      seeds: [],
      popularity: 'balanced',
      orderMode: 'random',
    },
    durationMs: input.minutes * MINUTE_MS,
    unmetConstraints: input.unmet ?? [],
  };
}

const SATISFIED = result({ trackCount: 10, minutes: 30 });

describe('unsatisfiedRefinementConstraints', () => {
  it('accepts a candidate inside the duration tolerance', () => {
    expect(
      unsatisfiedRefinementConstraints({
        intent: INTENT,
        current: SATISFIED,
        candidate: result({ trackCount: 9, minutes: 26 }),
      }),
    ).toEqual([]);
  });

  it('reports a candidate outside the duration tolerance', () => {
    expect(
      unsatisfiedRefinementConstraints({
        intent: INTENT,
        current: SATISFIED,
        candidate: result({ trackCount: 8, minutes: 24 }),
      }),
    ).toEqual([
      {
        type: 'duration',
        requestedMinutes: 30,
        actualDurationMs: 24 * MINUTE_MS,
      },
    ]);
  });

  it('reports a track count shortfall', () => {
    expect(
      unsatisfiedRefinementConstraints({
        intent: {
          ...INTENT,
          targetTrackCount: 10,
          targetDurationMinutes: null,
        },
        current: SATISFIED,
        candidate: result({ trackCount: 8, minutes: 24 }),
      }),
    ).toEqual([{ type: 'track_count', requested: 10, actual: 8 }]);
  });

  it('reports both dimensions when neither is met', () => {
    expect(
      unsatisfiedRefinementConstraints({
        intent: { ...INTENT, targetTrackCount: 12 },
        current: SATISFIED,
        candidate: result({ trackCount: 8, minutes: 24 }),
      }).map((unmet) => unmet.type),
    ).toEqual(['track_count', 'duration']);
  });

  it('never blocks on a mood that could not be applied', () => {
    expect(
      unsatisfiedRefinementConstraints({
        intent: { ...INTENT, mood: 'calm' },
        current: SATISFIED,
        candidate: result({
          trackCount: 10,
          minutes: 30,
          unmet: [
            { type: 'mood', mood: 'calm', reason: 'seed_not_mood_based' },
          ],
        }),
      }),
    ).toEqual([]);
  });

  describe('a shortfall the current playlist already had', () => {
    const shortCurrent = result({
      trackCount: 7,
      minutes: 21,
      unmet: [
        {
          type: 'duration',
          requestedMinutes: 30,
          actualDurationMs: 21 * MINUTE_MS,
        },
      ],
    });

    it('does not block a candidate that is no further from the target', () => {
      expect(
        unsatisfiedRefinementConstraints({
          intent: INTENT,
          current: shortCurrent,
          candidate: result({ trackCount: 7, minutes: 21 }),
        }),
      ).toEqual([]);
    });

    it('blocks a candidate that widens the shortfall', () => {
      expect(
        unsatisfiedRefinementConstraints({
          intent: INTENT,
          current: shortCurrent,
          candidate: result({ trackCount: 6, minutes: 18 }),
        }),
      ).toHaveLength(1);
    });

    it('blocks a candidate for a new target the old shortfall never covered', () => {
      expect(
        unsatisfiedRefinementConstraints({
          intent: { ...INTENT, targetDurationMinutes: 40 },
          current: shortCurrent,
          candidate: result({ trackCount: 7, minutes: 21 }),
        }),
      ).toEqual([
        {
          type: 'duration',
          requestedMinutes: 40,
          actualDurationMs: 21 * MINUTE_MS,
        },
      ]);
    });

    it('applies the same rule to a track count shortfall', () => {
      const current = result({
        trackCount: 8,
        minutes: 24,
        unmet: [{ type: 'track_count', requested: 10, actual: 8 }],
      });
      const intent = {
        ...INTENT,
        targetTrackCount: 10,
        targetDurationMinutes: null,
      };

      expect(
        unsatisfiedRefinementConstraints({
          intent,
          current,
          candidate: result({ trackCount: 8, minutes: 24 }),
        }),
      ).toEqual([]);
      expect(
        unsatisfiedRefinementConstraints({
          intent,
          current,
          candidate: result({ trackCount: 7, minutes: 21 }),
        }),
      ).toEqual([{ type: 'track_count', requested: 10, actual: 7 }]);
    });
  });
});
