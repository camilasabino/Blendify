import { PopularityMode, TrackOrderMode } from '@blendify/contracts';
import { Playlist } from '../../domain/playlist/playlist.entity';
import type { PlaylistRepositoryPort } from '../../domain/repositories/playlist.repository.port';
import { GetPlaylistDetailUseCase } from './get-playlist-detail.use-case';

function makePlaylist(userId = 'user-1'): Playlist {
  const seed = { id: 'artist-1', name: 'Sade' };
  return Playlist.create({
    id: 'playlist-1',
    userId,
    name: 'Evening mix',
    seeds: [{ type: 'artist', ...seed }],
    tracks: [],
    generation: {
      kind: 'artist_mix',
      version: 1,
      popularity: PopularityMode.BALANCED,
      orderMode: TrackOrderMode.ARTIST,
      tracksPerSeed: 10,
      seeds: [seed],
    },
  });
}

describe('GetPlaylistDetailUseCase', () => {
  it('returns the requested playlist for its owner', async () => {
    const playlist = makePlaylist();
    const findById = jest.fn().mockResolvedValue(playlist);
    const playlists = {
      findById,
    } as unknown as PlaylistRepositoryPort;

    const result = await new GetPlaylistDetailUseCase(playlists).execute(
      'user-1',
      'playlist-1',
    );

    expect(findById).toHaveBeenCalledWith('playlist-1');
    expect(result).toMatchObject({
      id: 'playlist-1',
      name: 'Evening mix',
      kind: 'artist_mix',
      trackCount: 0,
      generation: {
        orderMode: TrackOrderMode.ARTIST,
      },
    });
  });

  it.each([
    ['a missing playlist', null],
    ["another user's playlist", makePlaylist('user-2')],
  ])('hides %s behind a not-found error', async (_case, playlist) => {
    const playlists = {
      findById: jest.fn().mockResolvedValue(playlist),
    } as unknown as PlaylistRepositoryPort;

    await expect(
      new GetPlaylistDetailUseCase(playlists).execute('user-1', 'playlist-1'),
    ).rejects.toMatchObject({
      code: 'PLAYLIST_NOT_FOUND',
      details: { id: 'playlist-1' },
    });
  });
});
