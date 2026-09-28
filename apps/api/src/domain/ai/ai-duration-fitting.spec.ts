import { MAX_TRACKS } from '@/domain/constants';
import { Track } from '@/domain/track/track.entity';
import { ArtistId } from '@/domain/value-objects/artist-id.vo';
import { TrackId } from '@/domain/value-objects/track-id.vo';
import { candidateTrackCountForDuration } from './ai-target-duration';
import { selectAiTracks, totalDurationMs } from './ai-track-selection';
import { unmetGenerationConstraints } from './ai-unmet-constraints';

const MINUTE_MS = 60_000;
const ARTIST_COUNT = 7;

const DISTRIBUTIONS = {
  'short ~2 min': [1.8, 2, 2.2, 2.1, 1.9],
  'punk-like ~2.5 min': [2.3, 2.6, 2.4, 2.7, 2.5],
  'mostly ~3 min': [2.8, 3, 3.2, 3.1, 2.9],
  'pop/rock ~3.7 min': [3.5, 3.8, 4, 3.4, 3.9],
  'long 5–6 min': [5, 5.5, 6, 5.2, 5.8],
  mixed: [2, 3.5, 5.5, 3, 4, 2.5, 6],
} satisfies Record<string, number[]>;

function generatedPool(size: number, minutes: readonly number[]): Track[] {
  return Array.from({ length: size }, (_, index) =>
    Track.create({
      id: TrackId.create(`t${index}`),
      name: `Song ${index}`,
      artistId: ArtistId.create(`artist-${index % ARTIST_COUNT}`),
      artistName: `Artist ${index % ARTIST_COUNT}`,
      durationMs: Math.round(minutes[index % minutes.length] * MINUTE_MS),
      popularity: 50,
      uri: `spotify:track:t${index}`,
    }),
  );
}

function fit(input: {
  minutes: readonly number[];
  targetDurationMinutes: number;
  targetTrackCount?: number;
}) {
  const poolSize =
    input.targetTrackCount ??
    candidateTrackCountForDuration(input.targetDurationMinutes);
  const tracks = selectAiTracks({
    tracks: generatedPool(poolSize, input.minutes),
    exclusions: { artists: [], tracks: [] },
    targetTrackCount: input.targetTrackCount ?? null,
    targetDurationMinutes: input.targetDurationMinutes,
  });
  const durationMs = totalDurationMs(tracks);

  return {
    tracks,
    durationMs,
    unmet: unmetGenerationConstraints({
      targetTrackCount: input.targetTrackCount ?? null,
      targetDurationMinutes: input.targetDurationMinutes,
      mood: null,
      trackCount: tracks.length,
      durationMs,
    }),
  };
}

describe('AI duration fitting with synthetic track durations', () => {
  const reachable = [
    ...['short ~2 min', 'punk-like ~2.5 min'].flatMap((name) =>
      [10, 30, 60, 90].map((target) => ({ name, target })),
    ),
    { name: 'punk-like ~2.5 min', target: 120 },
    ...['mostly ~3 min', 'pop/rock ~3.7 min', 'long 5–6 min', 'mixed'].flatMap(
      (name) => [10, 60, 150].map((target) => ({ name, target })),
    ),
  ].map(({ name, target }) => ({
    name,
    target,
    minutes: DISTRIBUTIONS[name as keyof typeof DISTRIBUTIONS],
  }));

  it.each([10, 60, 90, 100, 150, 240, 10_080])(
    'never plans more than MAX_TRACKS candidates for %i min',
    (target) => {
      expect(candidateTrackCountForDuration(target)).toBeLessThanOrEqual(
        MAX_TRACKS,
      );
    },
  );

  it.each(reachable)(
    'meets $target min with $name tracks from the planned pool alone',
    ({ minutes, target }) => {
      const result = fit({ minutes, targetDurationMinutes: target });

      expect(result.unmet).toEqual([]);
      expect(result.tracks.length).toBeLessThanOrEqual(MAX_TRACKS);
    },
  );

  it('meets a long target near the track bound with long tracks', () => {
    const result = fit({
      minutes: DISTRIBUTIONS['long 5–6 min'],
      targetDurationMinutes: 240,
    });

    expect(result.unmet).toEqual([]);
    expect(result.tracks.length).toBeLessThan(MAX_TRACKS);
  });

  it('reports short tracks that cannot reach the target within the track bound', () => {
    const result = fit({
      minutes: DISTRIBUTIONS['short ~2 min'],
      targetDurationMinutes: 150,
    });

    expect(result.tracks).toHaveLength(MAX_TRACKS);
    expect(result.unmet.map((unmet) => unmet.type)).toEqual(['duration']);
  });

  it('stops at the track bound and reports a duration that 50 tracks cannot reach', () => {
    const result = fit({
      minutes: DISTRIBUTIONS['mostly ~3 min'],
      targetDurationMinutes: 240,
    });

    expect(result.tracks).toHaveLength(MAX_TRACKS);
    expect(result.unmet).toEqual([
      {
        type: 'duration',
        requestedMinutes: 240,
        actualDurationMs: result.durationMs,
      },
    ]);
  });

  it('keeps an explicit count unchanged and only reports the duration it misses', () => {
    const result = fit({
      minutes: DISTRIBUTIONS['mostly ~3 min'],
      targetDurationMinutes: 120,
      targetTrackCount: 20,
    });

    expect(result.tracks).toHaveLength(20);
    expect(result.unmet.map((unmet) => unmet.type)).toEqual(['duration']);
  });

  it('selects the same tracks for the same generated pool', () => {
    const first = fit({
      minutes: DISTRIBUTIONS.mixed,
      targetDurationMinutes: 90,
    });
    const second = fit({
      minutes: DISTRIBUTIONS.mixed,
      targetDurationMinutes: 90,
    });

    expect(second.tracks.map((track) => track.id.getValue())).toEqual(
      first.tracks.map((track) => track.id.getValue()),
    );
  });
});
