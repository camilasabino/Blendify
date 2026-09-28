import type { AiIntent } from '@/domain/ai/ai-intent';
import type { ResolvedAiSeeds } from '@/domain/ai/ai-resolved-seeds';
import { MAX_TRACKS } from '@/domain/constants';
import { moodGenreIds } from '@/domain/genre/mood-genres';
import { buildAiExecutionPlan } from './ai-execution-plan';

function intent(overrides: Partial<AiIntent>): AiIntent {
  return {
    kind: 'artist_mix',
    artists: [],
    genres: [],
    seedTracks: [],
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

function seeds(overrides: Partial<ResolvedAiSeeds> = {}): ResolvedAiSeeds {
  return { artists: [], genres: [], track: null, ...overrides };
}

const TWO_ARTISTS = seeds({
  artists: [
    { id: 'radiohead-id', name: 'Radiohead', imageUrl: 'https://img/r' },
    { id: 'interpol-id', name: 'Interpol' },
  ],
});

describe('buildAiExecutionPlan', () => {
  it('maps an artist mix onto the existing request with resolved snapshots and default settings', () => {
    const plan = buildAiExecutionPlan(
      intent({ artists: ['Radiohead', 'Interpol'] }),
      TWO_ARTISTS,
    );

    expect(plan.request).toEqual({
      kind: 'artist_mix',
      name: '',
      description: '',
      artistIds: ['radiohead-id', 'interpol-id'],
      artists: [
        { id: 'radiohead-id', name: 'Radiohead', imageUrl: 'https://img/r' },
        { id: 'interpol-id', name: 'Interpol', imageUrl: null },
      ],
      tracksPerSeed: 10,
      popularity: 'balanced',
      orderMode: 'random',
    });
    expect(plan.targetTrackCount).toBeNull();
    expect(plan.mood).toBeNull();
  });

  it('spreads an explicit count across seeds and keeps familiarity and ordering unchanged', () => {
    const plan = buildAiExecutionPlan(
      intent({
        artists: ['Radiohead', 'Interpol'],
        targetTrackCount: 25,
        popularity: 'rarities',
        orderMode: 'artist',
      }),
      TWO_ARTISTS,
    );

    expect(plan.request).toMatchObject({
      tracksPerSeed: 13,
      popularity: 'rarities',
      orderMode: 'artist',
    });
    expect(plan.targetTrackCount).toBe(25);
  });

  it('never asks a generator for more than the per-seed track budget', () => {
    const twelveArtists = seeds({
      artists: Array.from({ length: 12 }, (_, index) => ({
        id: `artist-${index}`,
        name: `Artist ${index}`,
      })),
    });

    const plan = buildAiExecutionPlan(
      intent({ targetTrackCount: MAX_TRACKS }),
      twelveArtists,
    );

    expect(plan.request).toMatchObject({ tracksPerSeed: 4 });
  });

  it('expands a mood-only request into the curated mood genres', () => {
    const plan = buildAiExecutionPlan(
      intent({ kind: 'genre_mix', mood: 'calm' }),
      seeds(),
    );

    expect(plan.request).toMatchObject({
      kind: 'genre_mix',
      genreIds: [...moodGenreIds('calm')],
      tracksPerSeed: 10,
    });
    expect(plan.mood).toEqual({ mood: 'calm', applied: true });
  });

  it('keeps explicit genres authoritative and does not add mood genres', () => {
    const plan = buildAiExecutionPlan(
      intent({ kind: 'genre_mix', genres: ['Pop'], mood: 'happy' }),
      seeds({ genres: [{ id: 'pop', name: 'Pop' }] }),
    );

    expect(plan.request).toMatchObject({
      genreIds: ['pop'],
      tracksPerSeed: 25,
    });
    expect(plan.mood).toEqual({
      mood: 'happy',
      applied: false,
      reason: 'mood_not_enforced_for_explicit_genres',
    });
  });

  it('keeps an artist seed authoritative and reports the mood as not applied', () => {
    const plan = buildAiExecutionPlan(
      intent({ kind: 'discover_artist', artists: ['Radiohead'], mood: 'sad' }),
      seeds({ artists: [{ id: 'radiohead-id', name: 'Radiohead' }] }),
    );

    expect(plan.request).toMatchObject({
      kind: 'discover_artist',
      artistId: 'radiohead-id',
      artist: { id: 'radiohead-id', name: 'Radiohead', imageUrl: null },
      targetTrackCount: 30,
    });
    expect(plan.mood).toEqual({
      mood: 'sad',
      applied: false,
      reason: 'seed_not_mood_based',
    });
  });

  it('maps a seed track and rounds the discovery pool up to a supported target', () => {
    const plan = buildAiExecutionPlan(
      intent({
        kind: 'discover_track',
        seedTracks: [{ title: 'Teardrop', artist: 'Massive Attack' }],
        targetTrackCount: 20,
      }),
      seeds({
        track: {
          id: 'teardrop-id',
          name: 'Teardrop',
          artistId: 'massive-id',
          artistName: 'Massive Attack',
          uri: 'spotify:track:teardrop-id',
          durationMs: 330_000,
          popularity: 70,
        },
      }),
    );

    expect(plan.request).toMatchObject({
      kind: 'discover_track',
      trackId: 'teardrop-id',
      track: {
        id: 'teardrop-id',
        artistId: 'massive-id',
        artistName: 'Massive Attack',
        uri: 'spotify:track:teardrop-id',
        albumImageUrl: null,
      },
      targetTrackCount: 30,
    });
    expect(plan.targetTrackCount).toBe(20);
  });

  it('plans a bounded candidate pool for a duration-only request', () => {
    const plan = buildAiExecutionPlan(
      intent({
        kind: 'genre_mix',
        genres: ['Shoegaze'],
        targetDurationMinutes: 60,
      }),
      seeds({ genres: [{ id: 'shoegaze', name: 'Shoegaze' }] }),
    );

    expect(plan.request).toMatchObject({ tracksPerSeed: 30 });
    expect(plan.targetTrackCount).toBeNull();
    expect(plan.targetDurationMinutes).toBe(60);
  });

  it('caps a long duration at the existing track limit instead of looping', () => {
    const plan = buildAiExecutionPlan(
      intent({ kind: 'discover_artist', targetDurationMinutes: 10_000 }),
      seeds({ artists: [{ id: 'radiohead-id', name: 'Radiohead' }] }),
    );

    expect(plan.request).toMatchObject({ targetTrackCount: MAX_TRACKS });
  });

  it('carries the explicit count, not the duration pool, when both are requested', () => {
    const plan = buildAiExecutionPlan(
      intent({
        artists: ['Radiohead', 'Interpol'],
        targetTrackCount: 10,
        targetDurationMinutes: 120,
      }),
      TWO_ARTISTS,
    );

    expect(plan.request).toMatchObject({ tracksPerSeed: 5 });
    expect(plan.targetTrackCount).toBe(10);
    expect(plan.targetDurationMinutes).toBe(120);
  });

  it('carries unresolved exclusion names for deterministic matching', () => {
    const plan = buildAiExecutionPlan(
      intent({
        artists: ['Radiohead', 'Interpol'],
        excludeArtists: ['Coldplay'],
        excludeTracks: [{ title: 'Creep', artist: 'Radiohead' }],
      }),
      TWO_ARTISTS,
    );

    expect(plan.exclusions).toEqual({
      artists: ['Coldplay'],
      tracks: [{ title: 'Creep', artist: 'Radiohead' }],
    });
  });
});
