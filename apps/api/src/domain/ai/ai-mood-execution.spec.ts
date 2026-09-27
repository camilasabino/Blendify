import { moodGenreIds } from '@/domain/genre/mood-genres';
import { moodExecutionFor } from './ai-mood-execution';
import { unmetGenerationConstraints } from './ai-unmet-constraints';

describe('AI mood execution', () => {
  it('is absent without a mood, including activity-only requests', () => {
    expect(
      moodExecutionFor({ kind: 'genre_mix', mood: null, explicitGenreIds: [] }),
    ).toBeNull();
  });

  it('applies a mood-only request through the curated mapping', () => {
    expect(
      moodExecutionFor({
        kind: 'genre_mix',
        mood: 'calm',
        explicitGenreIds: [],
      }),
    ).toEqual({ mood: 'calm', applied: true });
  });

  it('treats explicit genres that all belong to the mood mapping as satisfying it', () => {
    const [first, second] = moodGenreIds('dreamy');

    expect(
      moodExecutionFor({
        kind: 'genre_mix',
        mood: 'dreamy',
        explicitGenreIds: [first, second],
      }),
    ).toEqual({ mood: 'dreamy', applied: true });
  });

  it('does not claim the mood was enforced when an explicit genre is outside the curated mapping', () => {
    const [mapped] = moodGenreIds('happy');

    for (const explicitGenreIds of [['pop'], [mapped, 'pop']]) {
      expect(
        moodExecutionFor({
          kind: 'genre_mix',
          mood: 'happy',
          explicitGenreIds,
        }),
      ).toEqual({
        mood: 'happy',
        applied: false,
        reason: 'mood_not_enforced_for_explicit_genres',
      });
    }
  });

  it.each(['artist_mix', 'discover_artist', 'discover_track'] as const)(
    'never claims the mood for %s',
    (kind) => {
      expect(
        moodExecutionFor({ kind, mood: 'sad', explicitGenreIds: [] }),
      ).toEqual({ mood: 'sad', applied: false, reason: 'seed_not_mood_based' });
    },
  );
});

describe('AI unmet generation constraints', () => {
  it('reports nothing when every requested constraint is met', () => {
    expect(
      unmetGenerationConstraints({
        targetTrackCount: 20,
        targetDurationMinutes: 80,
        mood: { mood: 'calm', applied: true },
        trackCount: 20,
        durationMs: 78 * 60_000,
      }),
    ).toEqual([]);
  });

  it('reports count, duration and mood deterministically and in a stable order', () => {
    expect(
      unmetGenerationConstraints({
        targetTrackCount: 30,
        targetDurationMinutes: 120,
        mood: { mood: 'sad', applied: false, reason: 'seed_not_mood_based' },
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
      { type: 'mood', mood: 'sad', reason: 'seed_not_mood_based' },
    ]);
  });

  it('does not report a count or duration the user never requested', () => {
    expect(
      unmetGenerationConstraints({
        targetTrackCount: null,
        targetDurationMinutes: null,
        mood: null,
        trackCount: 3,
        durationMs: 60_000,
      }),
    ).toEqual([]);
  });
});
