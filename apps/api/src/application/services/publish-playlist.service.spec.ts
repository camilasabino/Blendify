import { PopularityMode, TrackOrderMode } from '@blendify/contracts';
import type { MusicProviderPort } from '../../domain/repositories/music-provider.port';
import type { PlaylistRepositoryPort } from '../../domain/repositories/playlist.repository.port';
import { Playlist } from '../../domain/playlist/playlist.entity';
import { Track } from '../../domain/track/track.entity';
import { ArtistId } from '../../domain/value-objects/artist-id.vo';
import { TrackId } from '../../domain/value-objects/track-id.vo';
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

  it('uses the fallback image and skips persistence when optional calls fail', async () => {
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
      fallbackImageUrl: 'https://images.example/fallback.jpg',
      persistToLibrary: false,
    });

    expect(save).not.toHaveBeenCalled();
    expect(result.status).toBe('COMPLETED');
    expect(result.imageUrl).toBe('https://images.example/fallback.jpg');
  });
});
