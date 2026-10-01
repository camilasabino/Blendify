import { moodGenreIds } from '@/domain/genre/mood-genres';
import { moodNotAppliedReason } from './ai-mood-execution';
import { unmetGenerationConstraints } from './ai-unmet-constraints';

describe('AI mood application', () => {
  it('is absent without a mood, including explicit-genre requests', () => {
    expect(
      moodNotAppliedReason({ kind: 'genre_mix', mood: null, genres: [] }),
    ).toBeNull();
    expect(
      moodNotAppliedReason({
        kind: 'genre_mix',
        mood: null,
        genres: ['rock británico'],
      }),
    ).toBeNull();
  });

  it('applies a mood-only request through the curated genre mapping', () => {
    expect(
      moodNotAppliedReason({
        kind: 'genre_mix',
        mood: 'energetic',
        genres: [],
      }),
    ).toBeNull();
  });

  it('recognizes the mood but does not apply it when an explicit genre takes precedence', () => {
    for (const genres of [['rock británico'], ['pop'], ['hard rock', 'pop']]) {
      expect(
        moodNotAppliedReason({ kind: 'genre_mix', mood: 'energetic', genres }),
      ).toBe('explicit_genre_precedence');
    }
  });

  it('does not apply the mood even when every explicit genre belongs to its mapping', () => {
    const [first, second] = moodGenreIds('dreamy');

    expect(
      moodNotAppliedReason({
        kind: 'genre_mix',
        mood: 'energetic',
        genres: ['hard rock'],
      }),
    ).toBe('explicit_genre_precedence');
    expect(
      moodNotAppliedReason({
        kind: 'genre_mix',
        mood: 'dreamy',
        genres: [first, second],
      }),
    ).toBe('explicit_genre_precedence');
  });

  it.each(['artist_mix', 'discover_artist', 'discover_track'] as const)(
    'never applies the mood to %s',
    (kind) => {
      expect(moodNotAppliedReason({ kind, mood: 'sad', genres: [] })).toBe(
        'seed_not_mood_based',
      );
    },
  );
});

describe('AI unmet generation constraints', () => {
  it('reports nothing when every requested constraint is met', () => {
    expect(
      unmetGenerationConstraints({
        targetTrackCount: 20,
        targetDurationMinutes: 80,
        trackCount: 20,
        durationMs: 78 * 60_000,
      }),
    ).toEqual([]);
  });

  it('reports count and duration deterministically and in a stable order', () => {
    expect(
      unmetGenerationConstraints({
        targetTrackCount: 30,
        targetDurationMinutes: 120,
        trackCount: 28,
        durationMs: 100 * 60_000,
      }),
    ).toEqual([
      { type: 'track_count', requested: 30, actual: 28 },
      {
        type: 'duration',
        requestedMinutes: 120,
        actualDurationMs: 100 * 60_000,
      },
    ]);
  });

  it('does not report a count or duration the user never requested', () => {
    expect(
      unmetGenerationConstraints({
        targetTrackCount: null,
        targetDurationMinutes: null,
        trackCount: 3,
        durationMs: 60_000,
      }),
    ).toEqual([]);
  });
});
