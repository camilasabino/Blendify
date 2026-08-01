import { PopularityMode, TrackOrderMode } from '@blendify/contracts';
import { ListLibraryPlaylistsUseCase } from './list-library-playlists.use-case';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import { Playlist } from '../../domain/playlist/playlist.entity';
import type { PlaylistRepositoryPort } from '../../domain/repositories/playlist.repository.port';
import type { MusicProviderFactoryPort } from '../../domain/repositories/music-provider.factory.port';

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

describe('ListLibraryPlaylistsUseCase sync quota', () => {
  it('rethrows Spotify quota errors during sync', async () => {
    const playlist = makePlaylist();
    playlist.linkToSpotify('sp1', 'https://open.spotify.com/playlist/sp1');
    playlist.markCompleted();

    const playlists = {
      deleteFailedByUserId: jest.fn().mockResolvedValue(undefined),
      listLibraryPage: jest.fn().mockResolvedValue({
        items: [playlist],
        total: 1,
      }),
      countLibraryPresence: jest
        .fn()
        .mockResolvedValue({ active: 1, deleted: 0 }),
      save: jest.fn(),
    } as unknown as PlaylistRepositoryPort;

    const provider = {
      listLibraryPlaylistIds: jest.fn().mockResolvedValue(new Set(['sp1'])),
      getPlaylistSnapshot: jest
        .fn()
        .mockRejectedValue(
          new BusinessRuleError('quota', 'SPOTIFY_QUOTA_EXCEEDED'),
        ),
    };

    const factories: MusicProviderFactoryPort = {
      forUser: () => provider as never,
    };

    const useCase = new ListLibraryPlaylistsUseCase(playlists, factories);

    await expect(
      useCase.execute('user-1', { sync: true, limit: 5, offset: 0 }),
    ).rejects.toMatchObject({ code: 'SPOTIFY_QUOTA_EXCEEDED' });
  });

  it('returns summaries without syncing when sync is false', async () => {
    const playlist = makePlaylist();
    const playlists = {
      deleteFailedByUserId: jest.fn().mockResolvedValue(undefined),
      listLibraryPage: jest.fn().mockResolvedValue({
        items: [playlist],
        total: 1,
      }),
      countLibraryPresence: jest
        .fn()
        .mockResolvedValue({ active: 1, deleted: 0 }),
    } as unknown as PlaylistRepositoryPort;

    const forUser = jest.fn();
    const factories: MusicProviderFactoryPort = { forUser };

    const page = await new ListLibraryPlaylistsUseCase(
      playlists,
      factories,
    ).execute('user-1', { sync: false });

    expect(page.playlists).toHaveLength(1);
    expect(page.playlists[0]?.name).toBe('Evening mix');
    expect(forUser).not.toHaveBeenCalled();
  });
});
