import { MAX_TRACKS } from '@/domain/constants';
import { Track } from '@/domain/track/track.entity';
import { ArtistId } from '@/domain/value-objects/artist-id.vo';
import { TrackId } from '@/domain/value-objects/track-id.vo';
import {
  candidateTrackCountForDuration,
  isDurationWithinTolerance,
} from './ai-target-duration';
import {
  selectAiTracks,
  totalDurationMs,
  type AiTrackSelectionInput,
} from './ai-track-selection';

const MINUTE_MS = 60_000;

function track(
  id: string,
  artist: string,
  minutes = 4,
  extra: { name?: string; featured?: string } = {},
): Track {
  return Track.create({
    id: TrackId.create(id),
    name: extra.name ?? `Song ${id}`,
    artistId: ArtistId.create(`artist-${artist}`),
    artistName: artist,
    durationMs: minutes * MINUTE_MS,
    popularity: 50,
    uri: `spotify:track:${id}`,
    artists: extra.featured
      ? [{ name: artist }, { name: extra.featured }]
      : undefined,
  });
}

function select(
  tracks: Track[],
  overrides: Partial<AiTrackSelectionInput> = {},
) {
  return selectAiTracks({
    tracks,
    exclusions: { artists: [], tracks: [] },
    targetTrackCount: null,
    targetDurationMinutes: null,
    ...overrides,
  });
}

function ids(tracks: readonly Track[]): string[] {
  return tracks.map((t) => t.id.getValue());
}

describe('AI track selection', () => {
  it('keeps the generated result unchanged without count, duration or exclusions', () => {
    const tracks = [track('a1', 'A'), track('b1', 'B'), track('a2', 'A')];

    expect(ids(select(tracks))).toEqual(['a1', 'b1', 'a2']);
  });

  it('trims to the explicit count by dropping extra tracks of the most represented artists, keeping order', () => {
    const tracks = [
      track('a1', 'A'),
      track('a2', 'A'),
      track('a3', 'A'),
      track('b1', 'B'),
      track('c1', 'C'),
    ];

    expect(ids(select(tracks, { targetTrackCount: 3 }))).toEqual([
      'a1',
      'b1',
      'c1',
    ]);
  });

  it('never adds tracks beyond what generation produced', () => {
    const tracks = [track('a1', 'A'), track('b1', 'B')];

    expect(select(tracks, { targetTrackCount: 30 })).toHaveLength(2);
  });

  it('removes excluded artists by any credited name with canonical normalization', () => {
    const tracks = [
      track('c1', 'Coldplay'),
      track('x1', 'Someone', 4, { featured: 'COLDPLAY' }),
      track('r1', 'Radiohead'),
    ];

    const selection = select(tracks, {
      exclusions: { artists: ['coldplay'], tracks: [] },
    });

    expect(ids(selection)).toEqual(['r1']);
  });

  it('removes excluded tracks by base title, restricted to the named artist when given', () => {
    const tracks = [
      track('y1', 'Coldplay', 4, { name: 'Yellow - 2008 Remaster' }),
      track('y2', 'Other Band', 4, { name: 'Yellow' }),
      track('k1', 'Radiohead', 4, { name: 'Karma Police' }),
      track('k2', 'Cover Band', 4, { name: 'Karma Police' }),
    ];

    const selection = select(tracks, {
      exclusions: {
        artists: [],
        tracks: [
          { title: 'Yellow', artist: 'Coldplay' },
          { title: 'karma police', artist: null },
        ],
      },
    });

    expect(ids(selection)).toEqual(['y2']);
  });

  it('applies the count after exclusions and reports the shortfall through the result size', () => {
    const tracks = [
      track('c1', 'Coldplay'),
      track('a1', 'A'),
      track('b1', 'B'),
    ];

    const selection = select(tracks, {
      targetTrackCount: 3,
      exclusions: { artists: ['Coldplay'], tracks: [] },
    });

    expect(ids(selection)).toEqual(['a1', 'b1']);
  });

  it('fits a duration-only request to the closest total from real track durations', () => {
    const tracks = [
      track('a1', 'A', 5),
      track('b1', 'B', 3),
      track('c1', 'C', 4),
      track('d1', 'D', 6),
      track('e1', 'E', 4),
    ];

    const selection = select(tracks, { targetDurationMinutes: 12 });

    expect(ids(selection)).toEqual(['a1', 'b1', 'c1']);
    expect(totalDurationMs(selection)).toBe(12 * MINUTE_MS);
  });

  it('keeps the explicit count authoritative when a duration is also requested', () => {
    const tracks = [
      track('a1', 'A', 4),
      track('b1', 'B', 4),
      track('c1', 'C', 4),
      track('d1', 'D', 4),
    ];

    const selection = select(tracks, {
      targetTrackCount: 2,
      targetDurationMinutes: 60,
    });

    expect(selection).toHaveLength(2);
  });

  it('keeps the whole pool when the duration target exceeds it', () => {
    const tracks = [track('a1', 'A', 4), track('b1', 'B', 4)];

    expect(select(tracks, { targetDurationMinutes: 600 })).toHaveLength(2);
  });
});

describe('AI target duration policy', () => {
  it('plans a bounded candidate pool from the requested minutes', () => {
    expect(candidateTrackCountForDuration(1)).toBe(1);
    expect(candidateTrackCountForDuration(60)).toBe(30);
    expect(candidateTrackCountForDuration(90)).toBe(45);
    expect(candidateTrackCountForDuration(150)).toBe(MAX_TRACKS);
    expect(candidateTrackCountForDuration(10_080)).toBe(MAX_TRACKS);
  });

  it('accepts an approximate result within the tolerance and rejects a distant one', () => {
    expect(isDurationWithinTolerance(57 * MINUTE_MS, 60)).toBe(true);
    expect(isDurationWithinTolerance(54 * MINUTE_MS, 60)).toBe(true);
    expect(isDurationWithinTolerance(53 * MINUTE_MS, 60)).toBe(false);
    expect(isDurationWithinTolerance(25 * MINUTE_MS, 20)).toBe(true);
    expect(isDurationWithinTolerance(26 * MINUTE_MS, 20)).toBe(false);
    expect(isDurationWithinTolerance(132 * MINUTE_MS, 120)).toBe(true);
    expect(isDurationWithinTolerance(133 * MINUTE_MS, 120)).toBe(false);
  });
});
