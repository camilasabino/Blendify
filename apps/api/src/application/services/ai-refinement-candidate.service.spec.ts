import { Artist } from '@/domain/artist/artist.entity';
import type { AiIntent } from '@/domain/ai/ai-intent';
import { EMPTY_AI_PRESERVATION } from '@/domain/ai/ai-intent-patch';
import type { AiGenerationResult } from '@/domain/ai/ai-session';
import { unmetGenerationConstraints } from '@/domain/ai/ai-unmet-constraints';
import { GeneratedPlaylist } from '@/domain/playlist/generated-playlist';
import { Track } from '@/domain/track/track.entity';
import { ArtistId } from '@/domain/value-objects/artist-id.vo';
import { TrackId } from '@/domain/value-objects/track-id.vo';
import { toGeneratedPlaylistPreview } from '@/application/dto/playlist-response.dto';
import { AiIntentResolver } from '@/application/services/ai-intent-resolver.service';
import { AiRefinementCandidateBuilder } from '@/application/services/ai-refinement-candidate.service';
import type {
  GeneratePlaylistUseCase,
  PlaylistGenerationRequest,
} from '@/application/use-cases/generate-playlist.use-case';

const MINUTE_MS = 60_000;
const TRACK_MINUTES = 3;
const TARGET_MINUTES = 30;

const BASE_INTENT: AiIntent = {
  kind: 'artist_mix',
  artists: ['Ed Sheeran'],
  genres: [],
  seedTracks: [],
  targetTrackCount: null,
  targetDurationMinutes: TARGET_MINUTES,
  mood: null,
  popularity: 'balanced',
  orderMode: null,
  excludeArtists: [],
  excludeTracks: [],
  unsupportedConstraints: [],
};

function track(id: string, artist: string): Track {
  return Track.create({
    id: TrackId.create(id),
    name: `Song ${id}`,
    artistId: ArtistId.create(`artist-${artist}`),
    artistName: artist,
    durationMs: TRACK_MINUTES * MINUTE_MS,
    popularity: 50,
    uri: `spotify:track:${id}`,
  });
}

function tracks(prefix: string, artist: string, count: number): Track[] {
  return Array.from({ length: count }, (_, index) =>
    track(`${prefix}${index + 1}`, artist),
  );
}

function resultOf(
  playlistTracks: readonly Track[],
  intent: AiIntent,
): AiGenerationResult {
  const playlist = GeneratedPlaylist.create({
    name: 'Blendify · Mix · Ed Sheeran',
    generation: {
      version: 1,
      kind: 'artist_mix',
      tracksPerSeed: 10,
      seeds: [{ id: 'ed-sheeran-id', name: 'Ed Sheeran' }],
      popularity: 'balanced',
      orderMode: 'random',
    },
    seeds: [{ type: 'artist', id: 'ed-sheeran-id', name: 'Ed Sheeran' }],
    tracks: [...playlistTracks],
  });
  const durationMs = playlistTracks.length * TRACK_MINUTES * MINUTE_MS;

  return {
    playlist: toGeneratedPlaylistPreview(playlist),
    recipe: playlist.generation,
    durationMs,
    unmetConstraints: unmetGenerationConstraints({
      targetTrackCount: intent.targetTrackCount,
      targetDurationMinutes: intent.targetDurationMinutes,
      mood: null,
      trackCount: playlistTracks.length,
      durationMs,
    }),
  };
}

function freshGeneration(generated: readonly Track[]): GeneratedPlaylist {
  return GeneratedPlaylist.create({
    name: 'Blendify · Mix · Ed Sheeran',
    generation: {
      version: 1,
      kind: 'artist_mix',
      tracksPerSeed: 10,
      seeds: [{ id: 'ed-sheeran-id', name: 'Ed Sheeran' }],
      popularity: 'balanced',
      orderMode: 'random',
    },
    seeds: [{ type: 'artist', id: 'ed-sheeran-id', name: 'Ed Sheeran' }],
    tracks: [...generated],
  });
}

function createBuilder(generated: readonly Track[]) {
  const catalog = {
    searchArtists: jest.fn((name: string) =>
      Promise.resolve([
        Artist.create({
          id: ArtistId.create('ed-sheeran-id'),
          name,
        }),
      ]),
    ),
    searchTracks: jest.fn(() => Promise.resolve([])),
    resolveTrack: jest.fn(() => Promise.resolve(null)),
    getArtistsByIds: jest.fn(() => Promise.resolve([])),
  };
  const generator = {
    execute: jest.fn<Promise<GeneratedPlaylist>, [PlaylistGenerationRequest]>(
      () => Promise.resolve(freshGeneration(generated)),
    ),
  };
  const builder = new AiRefinementCandidateBuilder(
    new AiIntentResolver({ forMarket: jest.fn(() => catalog) }),
    generator as unknown as GeneratePlaylistUseCase,
  );
  return { builder, generator };
}

const CURRENT_TRACKS = [
  ...tracks('ed', 'Ed Sheeran', 6),
  ...tracks('ts', 'Taylor Swift', 4),
];

function refine(
  builder: AiRefinementCandidateBuilder,
  refinement: Partial<AiIntent>,
  current: AiIntent = BASE_INTENT,
  currentTracks: readonly Track[] = CURRENT_TRACKS,
) {
  return builder.build({
    current,
    proposed: { ...current, ...refinement },
    preservation: EMPTY_AI_PRESERVATION,
    currentResult: resultOf(currentTracks, current),
    checkpoint: jest.fn(),
  });
}

function excludeTaylor(
  builder: AiRefinementCandidateBuilder,
  current: AiIntent = BASE_INTENT,
) {
  return refine(builder, { excludeArtists: ['Taylor Swift'] }, current);
}

const CONSTRAINTS_UNMET = {
  status: 'candidate',
  candidate: {
    status: 'failed',
    failure: {
      code: 'AI_REFINEMENT_CONSTRAINTS_UNMET',
      category: 'insufficient_results',
    },
  },
};

describe('AiRefinementCandidateBuilder duration invariant', () => {
  it('offers a candidate without Taylor Swift within the duration tolerance when the catalog has enough replacements', async () => {
    const { builder, generator } = createBuilder(
      tracks('new', 'Ed Sheeran', 5),
    );

    const outcome = await excludeTaylor(builder);

    expect(generator.execute).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({
      status: 'candidate',
      strategy: 'retain_and_fill',
      candidate: {
        status: 'ready',
        result: { durationMs: 30 * MINUTE_MS, unmetConstraints: [] },
      },
    });
    const ready = outcome.status === 'candidate' && outcome.candidate;
    expect(
      ready && ready.status === 'ready'
        ? ready.result.playlist.tracks.map((item) => item.artistName)
        : [],
    ).not.toContain('Taylor Swift');
  });

  it('keeps a candidate whose shortfall stays inside the duration tolerance', async () => {
    const { builder } = createBuilder(tracks('new', 'Ed Sheeran', 3));

    const outcome = await excludeTaylor(builder);

    expect(outcome).toMatchObject({
      status: 'candidate',
      candidate: {
        status: 'ready',
        result: { durationMs: 27 * MINUTE_MS, unmetConstraints: [] },
      },
    });
  });

  it('refuses a candidate that cannot reach the duration target after removing Taylor Swift', async () => {
    const { builder } = createBuilder(tracks('new', 'Ed Sheeran', 2));

    const outcome = await excludeTaylor(builder);

    expect(outcome).toEqual({
      status: 'candidate',
      strategy: 'retain_and_fill',
      candidate: {
        status: 'failed',
        failure: {
          code: 'AI_REFINEMENT_CONSTRAINTS_UNMET',
          category: 'insufficient_results',
          retryAfterSeconds: null,
          seedNotFound: null,
        },
      },
    });
  });
});

describe('AiRefinementCandidateBuilder effective constraints', () => {
  it('replaces the previous duration with an explicit new one', async () => {
    const { builder } = createBuilder(tracks('new', 'Ed Sheeran', 5));

    const outcome = await refine(builder, { targetDurationMinutes: 40 });

    expect(outcome).toMatchObject({
      status: 'candidate',
      strategy: 'retain_and_fill',
      candidate: {
        status: 'ready',
        result: { durationMs: 39 * MINUTE_MS, unmetConstraints: [] },
      },
    });
  });

  it('refuses an explicit longer duration the catalog cannot fill', async () => {
    const { builder } = createBuilder(tracks('new', 'Ed Sheeran', 1));

    const outcome = await refine(builder, { targetDurationMinutes: 40 });

    expect(outcome).toMatchObject(CONSTRAINTS_UNMET);
  });

  it('keeps duration and track count satisfied together while excluding an artist', async () => {
    const { builder } = createBuilder(tracks('new', 'Ed Sheeran', 5));
    const current = { ...BASE_INTENT, targetTrackCount: 10 };

    const outcome = await excludeTaylor(builder, current);

    expect(outcome).toMatchObject({
      status: 'candidate',
      candidate: {
        status: 'ready',
        result: { durationMs: 30 * MINUTE_MS, unmetConstraints: [] },
      },
    });
  });

  it('refuses a candidate that reaches the duration only by missing the track count', async () => {
    const { builder } = createBuilder(tracks('new', 'Ed Sheeran', 3));
    const current = { ...BASE_INTENT, targetTrackCount: 10 };

    const outcome = await excludeTaylor(builder, current);

    expect(outcome).toMatchObject(CONSTRAINTS_UNMET);
  });

  it('refuses a track count shortfall after an exclusion', async () => {
    const { builder } = createBuilder(tracks('new', 'Ed Sheeran', 2));
    const current = {
      ...BASE_INTENT,
      targetTrackCount: 10,
      targetDurationMinutes: null,
    };

    const outcome = await excludeTaylor(builder, current);

    expect(outcome).toMatchObject(CONSTRAINTS_UNMET);
  });

  it('refuses a regenerated candidate that misses the duration', async () => {
    const { builder } = createBuilder(tracks('new', 'Ed Sheeran', 2));

    const outcome = await refine(builder, { popularity: 'rarities' });

    expect(outcome).toMatchObject({
      strategy: 'regenerate',
      ...CONSTRAINTS_UNMET,
    });
  });

  it('still reorders a playlist that already fell short of its duration', async () => {
    const { builder, generator } = createBuilder([]);
    const shortTracks = tracks('ed', 'Ed Sheeran', 7);

    const outcome = await refine(
      builder,
      { orderMode: 'title' },
      BASE_INTENT,
      shortTracks,
    );

    expect(generator.execute).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      strategy: 'transform',
      candidate: {
        status: 'ready',
        result: {
          unmetConstraints: [{ type: 'duration', requestedMinutes: 30 }],
        },
      },
    });
  });

  it('refuses to widen a duration shortfall the playlist already had', async () => {
    const { builder } = createBuilder([]);
    const shortTracks = [
      ...tracks('ed', 'Ed Sheeran', 5),
      ...tracks('ts', 'Taylor Swift', 2),
    ];

    const outcome = await refine(
      builder,
      { excludeArtists: ['Taylor Swift'] },
      BASE_INTENT,
      shortTracks,
    );

    expect(outcome).toMatchObject(CONSTRAINTS_UNMET);
  });
});
