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

  it('syncs completed playlists still in the Spotify library', async () => {
    const playlist = makePlaylist();
    playlist.linkToSpotify('sp1', 'https://open.spotify.com/playlist/sp1');
    playlist.markCompleted();

    const save = jest
      .fn()
      .mockImplementation((p: Playlist) => Promise.resolve(p));
    const playlists = {
      deleteFailedByUserId: jest.fn().mockResolvedValue(undefined),
      listLibraryPage: jest.fn().mockResolvedValue({
        items: [playlist],
        total: 1,
      }),
      countLibraryPresence: jest
        .fn()
        .mockResolvedValue({ active: 1, deleted: 0 }),
      save,
    } as unknown as PlaylistRepositoryPort;

    const provider = {
      listLibraryPlaylistIds: jest.fn().mockResolvedValue(new Set(['sp1'])),
      getPlaylistSnapshot: jest.fn().mockResolvedValue({
        name: 'Synced',
        url: 'https://open.spotify.com/playlist/sp1',
        trackCount: 0,
        totalDurationMs: 0,
        tracks: [],
      }),
    };
    const factories: MusicProviderFactoryPort = {
      forUser: () => provider as never,
    };

    const page = await new ListLibraryPlaylistsUseCase(
      playlists,
      factories,
    ).execute('user-1', { sync: true });

    expect(page.playlists[0]?.name).toBe('Synced');
    expect(save).toHaveBeenCalled();
  });

  it('marks playlists missing when they left the Spotify library', async () => {
    const playlist = makePlaylist();
    playlist.linkToSpotify('sp1', 'https://open.spotify.com/playlist/sp1');
    playlist.markCompleted();

    const save = jest
      .fn()
      .mockImplementation((p: Playlist) => Promise.resolve(p));
    const playlists = {
      deleteFailedByUserId: jest.fn().mockResolvedValue(undefined),
      listLibraryPage: jest.fn().mockResolvedValue({
        items: [playlist],
        total: 1,
      }),
      countLibraryPresence: jest
        .fn()
        .mockResolvedValue({ active: 0, deleted: 1 }),
      save,
    } as unknown as PlaylistRepositoryPort;

    const provider = {
      listLibraryPlaylistIds: jest.fn().mockResolvedValue(new Set(['other'])),
      getPlaylistSnapshot: jest.fn(),
    };
    const factories: MusicProviderFactoryPort = {
      forUser: () => provider as never,
    };

    const page = await new ListLibraryPlaylistsUseCase(
      playlists,
      factories,
    ).execute('user-1', { sync: true });

    expect(page.playlists[0]?.missingOnSpotify).toBe(true);
    expect(provider.getPlaylistSnapshot).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalled();
  });

  it('marks playlists missing when Spotify snapshot is null', async () => {
    const playlist = makePlaylist();
    playlist.linkToSpotify('sp1', 'https://open.spotify.com/playlist/sp1');
    playlist.markCompleted();

    const save = jest
      .fn()
      .mockImplementation((p: Playlist) => Promise.resolve(p));
    const playlists = {
      deleteFailedByUserId: jest.fn().mockResolvedValue(undefined),
      listLibraryPage: jest.fn().mockResolvedValue({
        items: [playlist],
        total: 1,
      }),
      countLibraryPresence: jest
        .fn()
        .mockResolvedValue({ active: 0, deleted: 1 }),
      save,
    } as unknown as PlaylistRepositoryPort;

    const provider = {
      listLibraryPlaylistIds: jest.fn().mockResolvedValue(new Set(['sp1'])),
      getPlaylistSnapshot: jest.fn().mockResolvedValue(null),
    };
    const factories: MusicProviderFactoryPort = {
      forUser: () => provider as never,
    };

    const page = await new ListLibraryPlaylistsUseCase(
      playlists,
      factories,
    ).execute('user-1', { sync: true });

    expect(page.playlists[0]?.missingOnSpotify).toBe(true);
    expect(save).toHaveBeenCalled();
  });

  it('skips sync for already-missing or incomplete playlists', async () => {
    const missing = makePlaylist();
    missing.linkToSpotify('sp1', 'https://open.spotify.com/playlist/sp1');
    missing.markCompleted();
    missing.markMissingOnSpotify();

    const pending = makePlaylist();
    pending.linkToSpotify('sp2', 'https://open.spotify.com/playlist/sp2');

    const playlists = {
      deleteFailedByUserId: jest.fn().mockResolvedValue(undefined),
      listLibraryPage: jest.fn().mockResolvedValue({
        items: [missing, pending],
        total: 2,
      }),
      countLibraryPresence: jest
        .fn()
        .mockResolvedValue({ active: 1, deleted: 1 }),
      save: jest.fn(),
    } as unknown as PlaylistRepositoryPort;

    const getPlaylistSnapshot = jest.fn();
    const provider = {
      listLibraryPlaylistIds: jest
        .fn()
        .mockResolvedValue(new Set(['sp1', 'sp2'])),
      getPlaylistSnapshot,
    };
    const factories: MusicProviderFactoryPort = {
      forUser: () => provider as never,
    };

    await new ListLibraryPlaylistsUseCase(playlists, factories).execute(
      'user-1',
      { sync: true },
    );
    expect(getPlaylistSnapshot).not.toHaveBeenCalled();
  });

  it('continues when listing library ids fails non-quota', async () => {
    const playlist = makePlaylist();
    playlist.linkToSpotify('sp1', 'https://open.spotify.com/playlist/sp1');
    playlist.markCompleted();

    const save = jest
      .fn()
      .mockImplementation((p: Playlist) => Promise.resolve(p));
    const playlists = {
      deleteFailedByUserId: jest.fn().mockResolvedValue(undefined),
      listLibraryPage: jest.fn().mockResolvedValue({
        items: [playlist],
        total: 1,
      }),
      countLibraryPresence: jest
        .fn()
        .mockResolvedValue({ active: 1, deleted: 0 }),
      save,
    } as unknown as PlaylistRepositoryPort;

    const provider = {
      listLibraryPlaylistIds: jest.fn().mockRejectedValue(new Error('network')),
      getPlaylistSnapshot: jest.fn().mockResolvedValue({
        name: 'Still syncs',
        url: 'https://open.spotify.com/playlist/sp1',
        trackCount: 0,
        totalDurationMs: 0,
        tracks: [],
      }),
    };
    const factories: MusicProviderFactoryPort = {
      forUser: () => provider as never,
    };

    const page = await new ListLibraryPlaylistsUseCase(
      playlists,
      factories,
    ).execute('user-1', { sync: true });

    expect(page.playlists[0]?.name).toBe('Still syncs');
  });

  it('returns the local summary when snapshot sync fails non-quota', async () => {
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
      getPlaylistSnapshot: jest.fn().mockRejectedValue(new Error('boom')),
    };
    const factories: MusicProviderFactoryPort = {
      forUser: () => provider as never,
    };

    const page = await new ListLibraryPlaylistsUseCase(
      playlists,
      factories,
    ).execute('user-1', { sync: true });

    expect(page.playlists[0]?.name).toBe('Evening mix');
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
      countLibraryPresence: jest
        .fn()
        .mockResolvedValue({ active: 1, deleted: 0 }),
    } as unknown as PlaylistRepositoryPort;

    const page = await new ListLibraryPlaylistsUseCase(playlists, {
      forUser: jest.fn(),
    }).execute('user-1', { sync: false, q: ' eve ' });

    expect(page.playlists).toHaveLength(1);
    expect(listLibraryPage).toHaveBeenCalledWith('user-1', {
      limit: 5,
      offset: 0,
      q: 'eve',
    });
  });
});
