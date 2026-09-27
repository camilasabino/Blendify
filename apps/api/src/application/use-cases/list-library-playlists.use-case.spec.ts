import { PopularityMode, TrackOrderMode } from '@blendify/contracts';
import { ListLibraryPlaylistsUseCase } from './list-library-playlists.use-case';
import { Playlist } from '@/domain/playlist/playlist.entity';
import type { PlaylistRepositoryPort } from '@/domain/repositories/playlist.repository.port';

function makePlaylist(): Playlist {
  const seed = { id: 'artist-1', name: 'Sade' };
  return Playlist.create({
    id: 'playlist-1',
    userId: 'user-1',
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

describe('ListLibraryPlaylistsUseCase', () => {
  it('uses default paging when no options are given', async () => {
    const playlist = makePlaylist();
    const listLibraryPage = jest.fn().mockResolvedValue({
      items: [playlist],
      total: 1,
    });
    const playlists = {
      deleteFailedByUserId: jest.fn().mockResolvedValue(undefined),
      listLibraryPage,
    } as unknown as PlaylistRepositoryPort;

    const page = await new ListLibraryPlaylistsUseCase(playlists).execute(
      'user-1',
    );

    expect(page.limit).toBe(5);
    expect(page.offset).toBe(0);
    expect(listLibraryPage).toHaveBeenCalledWith('user-1', {
      limit: 5,
      offset: 0,
      q: undefined,
    });
  });

  it('returns library summaries', async () => {
    const playlist = makePlaylist();
    const playlists = {
      deleteFailedByUserId: jest.fn().mockResolvedValue(undefined),
      listLibraryPage: jest.fn().mockResolvedValue({
        items: [playlist],
        total: 1,
      }),
    } as unknown as PlaylistRepositoryPort;

    const page = await new ListLibraryPlaylistsUseCase(playlists).execute(
      'user-1',
    );

    expect(page.playlists).toHaveLength(1);
    expect(page.playlists[0]?.name).toBe('Evening mix');
    expect(page.total).toBe(1);
  });

  it('ignores purge failures and still lists the library', async () => {
    const playlist = makePlaylist();
    const listLibraryPage = jest.fn().mockResolvedValue({
      items: [playlist],
      total: 1,
    });
    const playlists = {
      deleteFailedByUserId: jest.fn().mockRejectedValue(new Error('db')),
      listLibraryPage,
    } as unknown as PlaylistRepositoryPort;

    const page = await new ListLibraryPlaylistsUseCase(playlists).execute(
      'user-1',
      { q: ' eve ' },
    );

    expect(page.playlists).toHaveLength(1);
    expect(listLibraryPage).toHaveBeenCalledWith('user-1', {
      limit: 5,
      offset: 0,
      q: 'eve',
    });
  });

  it('clamps limit to the [1, 50] range', async () => {
    const listLibraryPage = jest.fn().mockResolvedValue({
      items: [],
      total: 0,
    });
    const playlists = {
      deleteFailedByUserId: jest.fn().mockResolvedValue(undefined),
      listLibraryPage,
    } as unknown as PlaylistRepositoryPort;

    await new ListLibraryPlaylistsUseCase(playlists).execute('user-1', {
      limit: 500,
      offset: -5,
    });

    expect(listLibraryPage).toHaveBeenCalledWith('user-1', {
      limit: 50,
      offset: 0,
      q: undefined,
    });
  });
});
