import { PopularityMode, TrackOrderMode } from '@blendify/contracts';
import { ProviderOutcomeUnknownError } from '@/domain/errors/provider-outcome-unknown.error';
import { SpotifyProviderError } from '@/domain/errors/spotify-provider.error';
import { createSpotifyQuotaError } from '@/infrastructure/spotify/spotify-quota-error';
import type { MusicProviderPort } from '@/domain/repositories/music-provider.port';
import type { PlaylistRepositoryPort } from '@/domain/repositories/playlist.repository.port';
import { Playlist } from '@/domain/playlist/playlist.entity';
import { Track } from '@/domain/track/track.entity';
import { ArtistId } from '@/domain/value-objects/artist-id.vo';
import { TrackId } from '@/domain/value-objects/track-id.vo';
import { PublishPlaylistService } from './publish-playlist.service';

function makePlaylist(): Playlist {
  const seed = { id: 'artist-1', name: 'Sade' };
  const track = Track.create({
    id: TrackId.create('track-1'),
    name: 'Smooth Operator',
    artistId: ArtistId.create(seed.id),
    artistName: seed.name,
    durationMs: 250_000,
    popularity: 80,
    uri: 'spotify:track:track-1',
  });

  return Playlist.create({
    id: 'playlist-1',
    userId: 'user-1',
    name: 'Evening mix',
    description: 'A smooth selection',
    seeds: [{ type: 'artist', ...seed }],
    tracks: [track],
    generation: {
      kind: 'artist_mix',
      filters: {
        region: null,
        femaleVocals: false,
        releaseRange: null,
        excludeLive: false,
      },
      version: 1,
      popularity: PopularityMode.BALANCED,
      orderMode: TrackOrderMode.RANDOM,
      tracksPerSeed: 1,
      seeds: [seed],
    },
  });
}

describe('PublishPlaylistService', () => {
  it('publishes tracks and cover, enriches the playlist, and saves it', async () => {
    const playlist = makePlaylist();
    const save = jest.fn().mockResolvedValue(playlist);
    const playlists = {
      save,
    } as unknown as PlaylistRepositoryPort;
    const createPlaylist = jest.fn().mockResolvedValue({
      id: 'spotify-playlist-1',
      url: 'https://open.spotify.com/playlist/spotify-playlist-1',
    });
    const addTracksToPlaylist = jest.fn().mockResolvedValue(undefined);
    const uploadPlaylistCover = jest.fn().mockResolvedValue(undefined);
    const provider = {
      createPlaylist,
      addTracksToPlaylist,
      uploadPlaylistCover,
      getPlaylistSnapshot: jest.fn().mockResolvedValue({
        id: 'spotify-playlist-1',
        name: 'Evening mix',
        url: 'https://open.spotify.com/playlist/spotify-playlist-1',
        trackCount: 1,
        totalDurationMs: 250_000,
        imageUrl: 'https://images.example/cover.jpg',
      }),
    } as unknown as MusicProviderPort;

    const result = await new PublishPlaylistService(playlists).execute({
      playlist,
      provider,
      spotifyUserId: 'spotify-user-1',
      coverImageBase64: 'jpeg-data',
      persistToLibrary: true,
    });

    expect(createPlaylist).toHaveBeenCalledWith({
      userId: 'spotify-user-1',
      name: 'Evening mix',
      description: 'A smooth selection',
      isPublic: false,
    });
    expect(addTracksToPlaylist).toHaveBeenCalledWith('spotify-playlist-1', [
      'spotify:track:track-1',
    ]);
    expect(uploadPlaylistCover).toHaveBeenCalledWith(
      'spotify-playlist-1',
      'jpeg-data',
    );
    expect(save).toHaveBeenCalledWith(playlist);
    expect(result).toMatchObject({
      id: 'playlist-1',
      spotifyId: 'spotify-playlist-1',
      status: 'COMPLETED',
      imageUrl: 'https://images.example/cover.jpg',
      trackCount: 1,
    });
  });

  it('keeps no image and skips persistence when optional calls fail', async () => {
    const playlist = makePlaylist();
    const save = jest.fn();
    const playlists = {
      save,
    } as unknown as PlaylistRepositoryPort;
    const provider = {
      createPlaylist: jest.fn().mockResolvedValue({
        id: 'spotify-playlist-1',
        url: 'https://open.spotify.com/playlist/spotify-playlist-1',
      }),
      addTracksToPlaylist: jest.fn().mockResolvedValue(undefined),
      uploadPlaylistCover: jest
        .fn()
        .mockRejectedValue(new Error('upload failed')),
      getPlaylistSnapshot: jest
        .fn()
        .mockRejectedValue(new Error('lookup failed')),
    } as unknown as MusicProviderPort;

    const result = await new PublishPlaylistService(playlists).execute({
      playlist,
      provider,
      spotifyUserId: 'spotify-user-1',
      coverImageBase64: 'jpeg-data',
      persistToLibrary: false,
    });

    expect(save).not.toHaveBeenCalled();
    expect(result.status).toBe('COMPLETED');
    expect(result.imageUrl).toBeNull();
    expect(result.coverUploadFailed).toBe(true);
    expect(result.trackCount).toBe(1);
  });

  it('reports the created Spotify playlist before adding tracks', async () => {
    const playlist = makePlaylist();
    const calls: string[] = [];
    const provider = {
      createPlaylist: jest.fn(() => {
        calls.push('create');
        return Promise.resolve({
          id: 'spotify-playlist-1',
          url: 'https://sp/1',
        });
      }),
      addTracksToPlaylist: jest.fn(() => {
        calls.push('add');
        return Promise.reject(new Error('add failed'));
      }),
      uploadPlaylistCover: jest.fn(),
      getPlaylistSnapshot: jest.fn(),
    } as unknown as MusicProviderPort;
    const onRemotePlaylistCreated = jest.fn(() => {
      calls.push('created');
      return Promise.resolve();
    });

    await expect(
      new PublishPlaylistService({
        save: jest.fn(),
      } as unknown as PlaylistRepositoryPort).execute({
        playlist,
        provider,
        spotifyUserId: 'spotify-user-1',
        persistToLibrary: true,
        onRemotePlaylistCreated,
      }),
    ).rejects.toMatchObject({
      code: 'SPOTIFY_PLAYLIST_INCOMPLETE',
      details: {
        spotifyId: 'spotify-playlist-1',
        spotifyUrl: 'https://sp/1',
        failedStep: 'add_tracks',
        tracksAdded: 'unknown',
      },
    });

    expect(onRemotePlaylistCreated).toHaveBeenCalledWith({
      id: 'spotify-playlist-1',
      url: 'https://sp/1',
    });
    expect(calls).toEqual(['create', 'created', 'add']);
  });

  describe('provider failures', () => {
    const remote = {
      id: 'spotify-playlist-1',
      url: 'https://open.spotify.com/playlist/spotify-playlist-1',
    };

    function world(
      overrides: Partial<Record<keyof MusicProviderPort, jest.Mock>>,
    ) {
      const provider = {
        createPlaylist: jest.fn().mockResolvedValue(remote),
        addTracksToPlaylist: jest.fn().mockResolvedValue(undefined),
        uploadPlaylistCover: jest.fn().mockResolvedValue(undefined),
        getPlaylistSnapshot: jest.fn().mockResolvedValue(null),
        ...overrides,
      };
      const save = jest.fn((playlist: Playlist) => Promise.resolve(playlist));
      const service = new PublishPlaylistService({
        save,
      } as unknown as PlaylistRepositoryPort);
      const publish = (persistToLibrary = true) =>
        service.execute({
          playlist: makePlaylist(),
          provider: provider as unknown as MusicProviderPort,
          spotifyUserId: 'spotify-user-1',
          persistToLibrary,
        });
      return { provider, save, publish };
    }

    const unknownCreation = new ProviderOutcomeUnknownError('unknown', {
      operation: 'createPlaylist',
      category: 'upstream_error',
      status: 502,
    });

    it('surfaces an unconfirmed creation without continuing or retrying', async () => {
      const { provider, save, publish } = world({
        createPlaylist: jest.fn().mockRejectedValue(unknownCreation),
      });

      await expect(publish()).rejects.toBe(unknownCreation);

      expect(provider.createPlaylist).toHaveBeenCalledTimes(1);
      expect(provider.addTracksToPlaylist).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });

    it('surfaces a confirmed creation rejection unchanged', async () => {
      const rejected = new SpotifyProviderError('SPOTIFY_UNAVAILABLE', {
        operation: 'createPlaylist',
        category: 'network',
        status: null,
      });
      const { provider, publish } = world({
        createPlaylist: jest.fn().mockRejectedValue(rejected),
      });

      await expect(publish()).rejects.toBe(rejected);
      expect(provider.createPlaylist).toHaveBeenCalledTimes(1);
    });

    it.each([
      [
        'an unknown outcome',
        new ProviderOutcomeUnknownError('unknown', {
          operation: 'addTracksToPlaylist',
          category: 'timeout',
          status: null,
        }),
        'unknown',
      ],
      [
        'a rate limit',
        createSpotifyQuotaError({
          retryAfterSeconds: 30,
          retryAfterSource: 'spotify',
          reason: 'rate_limit',
        }),
        'none',
      ],
      [
        'a permission rejection',
        new SpotifyProviderError('SPOTIFY_PERMISSION_DENIED', {
          operation: 'addTracksToPlaylist',
          category: 'forbidden',
          status: 403,
        }),
        'none',
      ],
    ])(
      'keeps the created playlist when adding songs fails with %s',
      async (_label, failure, tracksAdded) => {
        const { provider, save, publish } = world({
          addTracksToPlaylist: jest.fn().mockRejectedValue(failure),
        });

        await expect(publish()).rejects.toMatchObject({
          code: 'SPOTIFY_PLAYLIST_INCOMPLETE',
          details: {
            spotifyId: remote.id,
            spotifyUrl: remote.url,
            failedStep: 'add_tracks',
            tracksAdded,
          },
        });
        expect(provider.createPlaylist).toHaveBeenCalledTimes(1);
        expect(provider.addTracksToPlaylist).toHaveBeenCalledTimes(1);
        expect(provider.uploadPlaylistCover).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
      },
    );

    it('reports a Library save failure after a complete Spotify playlist', async () => {
      const { provider, save, publish } = world({});
      save.mockRejectedValueOnce(new Error('database down'));

      await expect(publish()).rejects.toMatchObject({
        code: 'SPOTIFY_PLAYLIST_INCOMPLETE',
        details: {
          spotifyId: remote.id,
          failedStep: 'save_to_library',
          tracksAdded: 'all',
        },
      });
      expect(provider.createPlaylist).toHaveBeenCalledTimes(1);
      expect(provider.addTracksToPlaylist).toHaveBeenCalledTimes(1);
    });

    it('does not report a cover failure when no cover was requested', async () => {
      const { provider, publish } = world({});

      const result = await publish(false);

      expect(provider.uploadPlaylistCover).not.toHaveBeenCalled();
      expect(result.coverUploadFailed).toBeUndefined();
    });
  });
});
