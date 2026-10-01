import { Track } from '@/domain/track/track.entity';
import { ArtistId } from '@/domain/value-objects/artist-id.vo';
import { TrackId } from '@/domain/value-objects/track-id.vo';
import type { AiIntent } from './ai-intent';
import { EMPTY_AI_PRESERVATION, type AiPreservation } from './ai-intent-patch';
import { resolvePreservation } from './ai-refinement-preservation';

function track(id: string, artist: string, featured?: string): Track {
  return Track.create({
    id: TrackId.create(id),
    name: `Song ${id}`,
    artistId: ArtistId.create(`artist-${artist}`),
    artistName: artist,
    durationMs: 200_000,
    popularity: 50,
    uri: `spotify:track:${id}`,
    artists: featured ? [{ name: artist }, { name: featured }] : undefined,
  });
}

const TRACKS = [
  track('t1', 'Radiohead'),
  track('t2', 'Portishead'),
  track('t3', 'Björk', 'Radiohead'),
  track('t4', 'Coldplay'),
  track('t5', 'Massive Attack'),
];

function intent(overrides: Partial<AiIntent> = {}): AiIntent {
  return {
    kind: 'artist_mix',
    artists: ['Radiohead'],
    genres: [],
    seedTracks: [],
    filters: {
      region: null,
      femaleVocals: false,
      releaseRange: null,
      excludeLive: false,
    },
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

function resolve(
  preservation: Partial<AiPreservation>,
  overrides: Partial<AiIntent> = {},
) {
  return resolvePreservation({
    tracks: TRACKS,
    preservation: { ...EMPTY_AI_PRESERVATION, ...preservation },
    intent: intent(overrides),
  });
}

describe('resolvePreservation', () => {
  it('preserves nothing by default', () => {
    expect(resolve({})).toEqual({ status: 'resolved', positions: [] });
  });

  it('preserves the first N current positions', () => {
    expect(resolve({ firstTracks: 3 })).toEqual({
      status: 'resolved',
      positions: [1, 2, 3],
    });
  });

  it('preserves explicit 1-based positions', () => {
    expect(resolve({ positions: [5, 2] })).toEqual({
      status: 'resolved',
      positions: [2, 5],
    });
  });

  it('preserves every current track crediting a preserved artist, accent-insensitive', () => {
    expect(resolve({ artists: ['radiohead'] })).toEqual({
      status: 'resolved',
      positions: [1, 3],
    });
    expect(resolve({ artists: ['Bjork'] })).toEqual({
      status: 'resolved',
      positions: [3],
    });
  });

  it('unions and dedupes first N, positions and artist positions', () => {
    expect(
      resolve({ firstTracks: 2, positions: [2, 5], artists: ['Radiohead'] }),
    ).toEqual({ status: 'resolved', positions: [1, 2, 3, 5] });
  });

  it.each([
    ['first N', { firstTracks: 6 }],
    ['an explicit position', { positions: [6] }],
  ])('never clamps %s beyond the current playlist', (_label, preservation) => {
    expect(resolve(preservation)).toEqual({
      status: 'needs_clarification',
      clarification: expect.objectContaining({
        reason: 'preserved_track_out_of_range',
        limit: TRACKS.length,
      }) as object,
    });
  });

  it('reports preserved artists that are not in the current playlist', () => {
    expect(resolve({ artists: ['Radiohead', 'Interpol'] })).toEqual({
      status: 'needs_clarification',
      clarification: expect.objectContaining({
        reason: 'preserved_artist_not_found',
        names: ['Interpol'],
      }) as object,
    });
  });

  it('never matches artists fuzzily or by partial names', () => {
    expect(resolve({ artists: ['Radio'] })).toMatchObject({
      status: 'needs_clarification',
      clarification: { reason: 'preserved_artist_not_found' },
    });
  });

  it.each<[string, Partial<AiPreservation>, Partial<AiIntent>, string[]]>([
    [
      'a preserved artist that is also excluded',
      { artists: ['Coldplay'] },
      { excludeArtists: ['Coldplay'] },
      ['Coldplay'],
    ],
    [
      'a preserved position whose artist is excluded',
      { positions: [4] },
      { excludeArtists: ['coldplay'] },
      ['coldplay'],
    ],
    [
      'a preserved position whose track is excluded',
      { firstTracks: 2 },
      { excludeTracks: [{ title: 'Song t2', artist: null }] },
      ['Song t2'],
    ],
  ])(
    'reports %s as conflicting changes',
    (_label, preservation, overrides, names) => {
      expect(resolve(preservation, overrides)).toEqual({
        status: 'needs_clarification',
        clarification: {
          reason: 'conflicting_changes',
          seedType: null,
          limit: null,
          names,
          unsupportedConstraints: [],
        },
      });
    },
  );

  it('reports more preserved tracks than the requested count as conflicting', () => {
    expect(resolve({ firstTracks: 4 }, { targetTrackCount: 3 })).toEqual({
      status: 'needs_clarification',
      clarification: expect.objectContaining({
        reason: 'conflicting_changes',
        limit: 3,
      }) as object,
    });
  });

  it('reports a preserved position beyond the requested count as conflicting', () => {
    expect(resolve({ positions: [5] }, { targetTrackCount: 4 })).toMatchObject({
      status: 'needs_clarification',
      clarification: { reason: 'conflicting_changes', limit: 4 },
    });
    expect(resolve({ positions: [4] }, { targetTrackCount: 4 })).toEqual({
      status: 'resolved',
      positions: [4],
    });
  });
});
