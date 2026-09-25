import type { GenerationProgress } from '@blendify/contracts';
import { GeneratedPlaylist } from '../../domain/playlist/generated-playlist';
import type { ProgressReporter } from '../services/generation-progress.tracker';
import type { GenerateArtistMixUseCase } from './generate-artist-mix.use-case';
import type { GenerateDiscoverPlaylistUseCase } from './generate-discover-playlist.use-case';
import type { GenerateGenreMixUseCase } from './generate-genre-mix.use-case';
import {
  GeneratePlaylistUseCase,
  type PlaylistGenerationRequest,
} from './generate-playlist.use-case';

const generated = GeneratedPlaylist.create({
  name: 'Generated',
  generation: {
    version: 1,
    kind: 'artist_mix',
    tracksPerSeed: 1,
    seeds: [{ id: 'artist-1', name: 'Sade' }],
    popularity: 'balanced',
    orderMode: 'random',
  },
  seeds: [{ type: 'artist', id: 'artist-1', name: 'Sade' }],
  tracks: [],
});

const shared = {
  name: '',
  description: '',
  popularity: 'balanced',
  orderMode: 'random',
} as const;

const requests: Record<string, PlaylistGenerationRequest> = {
  artist_mix: {
    ...shared,
    kind: 'artist_mix',
    artistIds: ['artist-1'],
    tracksPerSeed: 1,
  },
  genre_mix: {
    ...shared,
    kind: 'genre_mix',
    genreIds: ['jazz'],
    tracksPerSeed: 1,
  },
  discover_artist: {
    ...shared,
    kind: 'discover_artist',
    artistId: 'artist-1',
    targetTrackCount: 15,
  },
  discover_track: {
    ...shared,
    kind: 'discover_track',
    trackId: 'track-1',
    track: {
      id: 'track-1',
      name: 'Smooth Operator',
      artistId: 'artist-1',
      artistName: 'Sade',
    },
    targetTrackCount: 15,
  },
};

function progress(percent: number): GenerationProgress {
  return {
    phase: 'matching_tracks',
    current: percent,
    total: 100,
    percent,
    etaSeconds: null,
  };
}

function emitting(percents: number[]) {
  return jest.fn(
    (_request: unknown, options?: { onProgress?: ProgressReporter }) => {
      for (const percent of percents) options?.onProgress?.(progress(percent));
      return Promise.resolve(generated);
    },
  );
}

function setup(percents: number[] = []) {
  const artistMix = emitting(percents);
  const genreMix = emitting(percents);
  const discover = emitting(percents);
  const useCase = new GeneratePlaylistUseCase(
    { execute: artistMix } as unknown as GenerateArtistMixUseCase,
    { execute: genreMix } as unknown as GenerateGenreMixUseCase,
    { execute: discover } as unknown as GenerateDiscoverPlaylistUseCase,
  );
  return { artistMix, genreMix, discover, useCase };
}

describe('GeneratePlaylistUseCase', () => {
  it.each([
    ['artist_mix', 'artistMix'],
    ['genre_mix', 'genreMix'],
    ['discover_artist', 'discover'],
    ['discover_track', 'discover'],
  ] as const)('dispatches %s to its generator', async (kind, generator) => {
    const context = setup();

    await expect(context.useCase.execute(requests[kind])).resolves.toBe(
      generated,
    );

    expect(context[generator]).toHaveBeenCalledWith(requests[kind], undefined);
    for (const other of ['artistMix', 'genreMix', 'discover'] as const) {
      if (other !== generator) expect(context[other]).not.toHaveBeenCalled();
    }
  });

  it.each(['discover_artist', 'discover_track'] as const)(
    'keeps %s progress monotonic',
    async (kind) => {
      const context = setup([10, 60, 20, 90]);
      const onProgress = jest.fn();

      await context.useCase.execute(requests[kind], { onProgress });

      expect(
        onProgress.mock.calls.map(
          ([event]: [GenerationProgress]) => event.percent,
        ),
      ).toEqual([10, 60, 90]);
    },
  );

  it.each(['artist_mix', 'genre_mix'] as const)(
    'forwards %s progress unchanged',
    async (kind) => {
      const context = setup([60, 40]);
      const onProgress = jest.fn();

      await context.useCase.execute(requests[kind], { onProgress });

      expect(
        onProgress.mock.calls.map(
          ([event]: [GenerationProgress]) => event.percent,
        ),
      ).toEqual([60, 40]);
    },
  );
});
