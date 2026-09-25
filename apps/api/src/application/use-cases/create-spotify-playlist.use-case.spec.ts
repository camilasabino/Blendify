import type {
  GenerationProgress,
  PlaylistDetail,
  PlaylistGeneration,
  PlaylistSeedDto,
} from '@blendify/contracts';
import { GeneratedPlaylist } from '../../domain/playlist/generated-playlist';
import type { MusicProviderPort } from '../../domain/repositories/music-provider.port';
import type { UsageStatsRepositoryPort } from '../../domain/repositories/usage-stats.repository.port';
import type { UserRepositoryPort } from '../../domain/repositories/user.repository.port';
import { Track } from '../../domain/track/track.entity';
import { User } from '../../domain/user/user.entity';
import { ArtistId } from '../../domain/value-objects/artist-id.vo';
import { TrackId } from '../../domain/value-objects/track-id.vo';
import type { PublishPlaylistService } from '../services/publish-playlist.service';
import type { ProgressReporter } from '../services/generation-progress.tracker';
import {
  CreateSpotifyPlaylistUseCase,
  type SpotifyPlaylistRequest,
} from './create-spotify-playlist.use-case';
import type { GenerateArtistMixUseCase } from './generate-artist-mix.use-case';
import type { GenerateDiscoverPlaylistUseCase } from './generate-discover-playlist.use-case';
import type { GenerateGenreMixUseCase } from './generate-genre-mix.use-case';
import { GeneratePlaylistUseCase } from './generate-playlist.use-case';

const track = Track.create({
  id: TrackId.create('track-1'),
  name: 'Smooth Operator',
  artistId: ArtistId.create('artist-1'),
  artistName: 'Sade',
  durationMs: 250_000,
  popularity: 80,
  uri: 'spotify:track:track-1',
});

function generated(
  generation: PlaylistGeneration,
  seeds: PlaylistSeedDto[],
): GeneratedPlaylist {
  return GeneratedPlaylist.create({
    name: 'Generated',
    description: 'From the generator',
    generation,
    seeds,
    tracks: [track],
    coverCandidateUrl: 'https://images.example/cover.jpg',
  });
}

const artistMixPlaylist = generated(
  {
    version: 1,
    kind: 'artist_mix',
    tracksPerSeed: 1,
    seeds: [{ id: 'artist-1', name: 'Sade', imageUrl: 'sade.jpg' }],
    popularity: 'balanced',
    orderMode: 'random',
  },
  [{ type: 'artist', id: 'artist-1', name: 'Sade', imageUrl: 'sade.jpg' }],
);

const artistMixRequest: SpotifyPlaylistRequest = {
  kind: 'artist_mix',
  name: '',
  description: '',
  artistIds: ['artist-1'],
  tracksPerSeed: 1,
  popularity: 'balanced',
  orderMode: 'random',
  coverImageBase64: 'aGVsbG8=',
  persistToLibrary: false,
};

const discoverTrackRequest: SpotifyPlaylistRequest = {
  kind: 'discover_track',
  name: '',
  description: '',
  trackId: 'track-1',
  track: {
    id: 'track-1',
    name: 'Smooth Operator',
    artistId: 'artist-1',
    artistName: 'Sade',
  },
  targetTrackCount: 15,
  popularity: 'balanced',
  orderMode: 'random',
  persistToLibrary: true,
};

function setup() {
  const findById = jest.fn((id: string) =>
    Promise.resolve(
      id === 'user-1'
        ? User.create({
            id: 'user-1',
            spotifyId: 'spotify-user-1',
            displayName: 'Listener',
          })
        : null,
    ),
  );
  const provider = {} as MusicProviderPort;
  const forUser = jest.fn().mockReturnValue(provider);
  const recordMix = jest.fn().mockResolvedValue(undefined);
  const artistMix = jest.fn().mockResolvedValue(artistMixPlaylist);
  const genreMix = jest.fn();
  const discover = jest.fn();
  type PublishInput = Parameters<PublishPlaylistService['execute']>[0];
  const publish = jest.fn((input: PublishInput) => {
    void input;
    return Promise.resolve({ id: 'published' } as PlaylistDetail);
  });

  const useCase = new CreateSpotifyPlaylistUseCase(
    { findById } as unknown as UserRepositoryPort,
    { forUser },
    { recordMix } as unknown as UsageStatsRepositoryPort,
    new GeneratePlaylistUseCase(
      { execute: artistMix } as unknown as GenerateArtistMixUseCase,
      { execute: genreMix } as unknown as GenerateGenreMixUseCase,
      { execute: discover } as unknown as GenerateDiscoverPlaylistUseCase,
    ),
    { execute: publish } as unknown as PublishPlaylistService,
  );

  return {
    artistMix,
    discover,
    findById,
    forUser,
    genreMix,
    provider,
    publish,
    recordMix,
    useCase,
  };
}

function progress(percent: number): GenerationProgress {
  return {
    phase: percent >= 90 ? 'publishing' : 'matching_tracks',
    current: percent,
    total: 100,
    percent,
    etaSeconds: null,
  };
}

describe('CreateSpotifyPlaylistUseCase', () => {
  it('fails before generation when the user no longer exists', async () => {
    const context = setup();

    await expect(
      context.useCase.execute({
        userId: 'missing-user',
        request: artistMixRequest,
      }),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });

    expect(context.artistMix).not.toHaveBeenCalled();
    expect(context.publish).not.toHaveBeenCalled();
    expect(context.recordMix).not.toHaveBeenCalled();
  });

  it('generates without publication fields, then publishes and records stats', async () => {
    const context = setup();

    const result = await context.useCase.execute({
      userId: 'user-1',
      request: artistMixRequest,
    });

    expect(result).toEqual({ id: 'published' });
    expect(context.findById).toHaveBeenCalledTimes(1);
    const [[generationRequest]] = context.artistMix.mock.calls as Array<
      [Record<string, unknown>]
    >;
    expect(generationRequest).toMatchObject({
      kind: 'artist_mix',
      artistIds: ['artist-1'],
    });
    expect(generationRequest).not.toHaveProperty('coverImageBase64');
    expect(generationRequest).not.toHaveProperty('persistToLibrary');
    expect(generationRequest).not.toHaveProperty('userId');

    expect(context.forUser).toHaveBeenCalledWith('user-1');
    const published = context.publish.mock.calls[0][0];
    expect(published).toMatchObject({
      provider: context.provider,
      spotifyUserId: 'spotify-user-1',
      coverImageBase64: 'aGVsbG8=',
      fallbackImageUrl: 'https://images.example/cover.jpg',
      persistToLibrary: false,
    });
    expect(published.playlist).toMatchObject({
      userId: 'user-1',
      kind: 'artist_mix',
      description: 'From the generator',
      seeds: artistMixPlaylist.seeds,
      generation: artistMixPlaylist.generation,
    });
    expect(published.playlist.name.getValue()).toBe('Generated');

    expect(context.recordMix).toHaveBeenCalledWith({
      userId: 'user-1',
      kind: 'artist',
      seeds: [
        {
          kind: 'artist',
          seedKey: 'artist-1',
          name: 'Sade',
          imageUrl: 'sade.jpg',
        },
      ],
    });
  });

  it('records genre stats from the generated genre seeds', async () => {
    const context = setup();
    context.genreMix.mockResolvedValue(
      generated(
        {
          version: 1,
          kind: 'genre_mix',
          tracksPerSeed: 1,
          seeds: [{ id: 'jazz', name: 'Jazz' }],
          popularity: 'balanced',
          orderMode: 'random',
        },
        [{ type: 'genre', id: 'jazz', name: 'Jazz', imageUrl: 'jazz.jpg' }],
      ),
    );

    await context.useCase.execute({
      userId: 'user-1',
      request: {
        kind: 'genre_mix',
        name: '',
        description: '',
        genreIds: ['jazz'],
        tracksPerSeed: 1,
        popularity: 'balanced',
        orderMode: 'random',
        persistToLibrary: true,
      },
    });

    expect(context.recordMix).toHaveBeenCalledWith({
      userId: 'user-1',
      kind: 'genre',
      seeds: [
        { kind: 'genre', seedKey: 'jazz', name: 'Jazz', imageUrl: 'jazz.jpg' },
      ],
    });
  });

  it('records the seed artist for Discover Artist', async () => {
    const context = setup();
    context.discover.mockResolvedValue(
      generated(
        {
          version: 1,
          kind: 'discover_artist',
          targetTrackCount: 15,
          seed: { id: 'artist-1', name: 'Sade', imageUrl: null },
          popularity: 'balanced',
          orderMode: 'random',
        },
        [{ type: 'artist', id: 'artist-1', name: 'Sade', imageUrl: null }],
      ),
    );

    await context.useCase.execute({
      userId: 'user-1',
      request: {
        kind: 'discover_artist',
        name: '',
        description: '',
        artistId: 'artist-1',
        targetTrackCount: 15,
        popularity: 'balanced',
        orderMode: 'random',
        persistToLibrary: true,
      },
    });

    expect(context.recordMix).toHaveBeenCalledWith({
      userId: 'user-1',
      kind: 'artist',
      seeds: [
        { kind: 'artist', seedKey: 'artist-1', name: 'Sade', imageUrl: null },
      ],
    });
  });

  it('records the seed track artist for Discover Track', async () => {
    const context = setup();
    context.discover.mockResolvedValue(
      generated(
        {
          version: 1,
          kind: 'discover_track',
          targetTrackCount: 15,
          seed: {
            id: 'track-1',
            name: 'Smooth Operator',
            artistId: 'artist-1',
            artistName: 'Sade',
            albumImageUrl: 'album.jpg',
          },
          popularity: 'balanced',
          orderMode: 'random',
        },
        [
          {
            type: 'track',
            id: 'track-1',
            name: 'Smooth Operator',
            artistId: 'artist-1',
            artistName: 'Sade',
            albumImageUrl: 'album.jpg',
          },
        ],
      ),
    );

    await context.useCase.execute({
      userId: 'user-1',
      request: discoverTrackRequest,
    });

    expect(context.recordMix).toHaveBeenCalledWith({
      userId: 'user-1',
      kind: 'artist',
      seeds: [
        {
          kind: 'artist',
          seedKey: 'artist-1',
          name: 'Sade',
          imageUrl: 'album.jpg',
        },
      ],
    });
  });

  it('keeps Discover progress monotonic across generation and publication', async () => {
    const context = setup();
    context.discover.mockImplementation(
      (_request: unknown, options?: { onProgress?: ProgressReporter }) => {
        options?.onProgress?.(progress(60));
        options?.onProgress?.(progress(20));
        options?.onProgress?.(progress(90));
        return Promise.resolve(artistMixPlaylist);
      },
    );
    context.publish.mockImplementation((input) => {
      input.onProgress?.(progress(95));
      input.onProgress?.(progress(100));
      return Promise.resolve({ id: 'published' } as PlaylistDetail);
    });
    const onProgress = jest.fn();

    await context.useCase.execute(
      { userId: 'user-1', request: discoverTrackRequest },
      { onProgress },
    );

    expect(
      onProgress.mock.calls.map(
        ([event]: [GenerationProgress]) => event.percent,
      ),
    ).toEqual([60, 90, 95, 100]);
  });

  it('forwards Mix progress unchanged to generation and publication', async () => {
    const context = setup();
    context.artistMix.mockImplementation(
      (_request: unknown, options?: { onProgress?: ProgressReporter }) => {
        options?.onProgress?.(progress(60));
        options?.onProgress?.(progress(40));
        return Promise.resolve(artistMixPlaylist);
      },
    );
    context.publish.mockImplementation((input) => {
      input.onProgress?.(progress(100));
      return Promise.resolve({ id: 'published' } as PlaylistDetail);
    });
    const onProgress = jest.fn();

    await context.useCase.execute(
      { userId: 'user-1', request: artistMixRequest },
      { onProgress },
    );

    expect(
      onProgress.mock.calls.map(
        ([event]: [GenerationProgress]) => event.percent,
      ),
    ).toEqual([60, 40, 100]);
  });

  it('returns the published playlist when stats recording fails', async () => {
    const context = setup();
    context.recordMix.mockRejectedValue(new Error('stats down'));

    await expect(
      context.useCase.execute({ userId: 'user-1', request: artistMixRequest }),
    ).resolves.toEqual({ id: 'published' });
  });
});
