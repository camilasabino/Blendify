import { PopularityMode, TrackOrderMode } from '@blendify/contracts';
import { SyncLibraryUseCase } from './sync-library.use-case';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import { Playlist } from '../../domain/playlist/playlist.entity';
import type { PlaylistRepositoryPort } from '../../domain/repositories/playlist.repository.port';
import type { MusicProviderFactoryPort } from '../../domain/repositories/music-provider.factory.port';

function makePlaylist(id: string, spotifyId: string, name: string): Playlist {
  const seed = { id: `artist-${id}`, name };
  const playlist = Playlist.create({
    id,
    userId: 'user-1',
    name,
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
  playlist.linkToSpotify(
    spotifyId,
    `https://open.spotify.com/playlist/${spotifyId}`,
  );
  playlist.markCompleted();
  return playlist;
}

function makeRepository(playlists: Playlist[]) {
  const listLibrary = jest.fn().mockResolvedValue(playlists);
  const save = jest
    .fn()
    .mockImplementation((p: Playlist) => Promise.resolve(p));
  const deleteMany = jest.fn().mockResolvedValue(undefined);
  const repository = {
    listLibrary,
    save,
    deleteMany,
  } as unknown as PlaylistRepositoryPort;
  return { repository, listLibrary, save, deleteMany };
}

function makeFactory(provider: unknown): MusicProviderFactoryPort {
  return { forUser: () => provider as never };
}

describe('SyncLibraryUseCase', () => {
  it('checks every library playlist in one pass, independent of any page size', async () => {
    const playlists = Array.from({ length: 12 }, (_, i) =>
      makePlaylist(`playlist-${i}`, `sp${i}`, `Mix ${i}`),
    );
    const { repository, listLibrary } = makeRepository(playlists);
    const provider = {
      listLibraryPlaylistIds: jest
        .fn()
        .mockResolvedValue(new Set(playlists.map((p) => p.spotifyId))),
      getPlaylistSnapshot: jest.fn().mockResolvedValue({
        name: 'Synced',
        url: 'https://open.spotify.com/playlist/sp',
        trackCount: 0,
        totalDurationMs: 0,
        tracks: [],
      }),
    };

    const result = await new SyncLibraryUseCase(
      repository,
      makeFactory(provider),
    ).execute('user-1');

    expect(listLibrary).toHaveBeenCalledWith('user-1', {});
    expect(provider.getPlaylistSnapshot).toHaveBeenCalledTimes(12);
    expect(result.checkedCount).toBe(12);
    expect(result.removedCount).toBe(0);
  });

  it('deletes a playlist confirmed missing (absent from listing and a 404 snapshot)', async () => {
    const playlist = makePlaylist('playlist-1', 'sp1', 'Evening mix');
    const { repository, deleteMany } = makeRepository([playlist]);
    const provider = {
      listLibraryPlaylistIds: jest.fn().mockResolvedValue(new Set()),
      getPlaylistSnapshot: jest.fn().mockResolvedValue(null),
    };

    const result = await new SyncLibraryUseCase(
      repository,
      makeFactory(provider),
    ).execute('user-1');

    expect(deleteMany).toHaveBeenCalledWith('user-1', ['playlist-1']);
    expect(result.removedCount).toBe(1);
    expect(result.checkedCount).toBe(1);
  });

  it('does not delete when the listing says present but the snapshot 404s (insufficient evidence)', async () => {
    const playlist = makePlaylist('playlist-1', 'sp1', 'Evening mix');
    const { repository, deleteMany } = makeRepository([playlist]);
    const provider = {
      listLibraryPlaylistIds: jest.fn().mockResolvedValue(new Set(['sp1'])),
      getPlaylistSnapshot: jest.fn().mockResolvedValue(null),
    };

    const result = await new SyncLibraryUseCase(
      repository,
      makeFactory(provider),
    ).execute('user-1');

    expect(deleteMany).not.toHaveBeenCalled();
    expect(result.removedCount).toBe(0);
  });

  it('does not delete when the provider fails with a non-404 error (e.g. 403)', async () => {
    const playlist = makePlaylist('playlist-1', 'sp1', 'Evening mix');
    const { repository, deleteMany } = makeRepository([playlist]);
    const provider = {
      listLibraryPlaylistIds: jest.fn().mockResolvedValue(new Set()),
      getPlaylistSnapshot: jest
        .fn()
        .mockRejectedValue(new Error('403 Forbidden')),
    };

    const result = await new SyncLibraryUseCase(
      repository,
      makeFactory(provider),
    ).execute('user-1');

    expect(deleteMany).not.toHaveBeenCalled();
    expect(result.removedCount).toBe(0);
  });

  it('deletes multiple confirmed-missing playlists spanning what would be different UI pages in a single atomic call', async () => {
    const playlists = [
      makePlaylist('playlist-1', 'sp1', 'Mix one'),
      makePlaylist('playlist-2', 'sp2', 'Mix two'),
      makePlaylist('playlist-3', 'sp3', 'Mix three'),
    ];
    const { repository, deleteMany } = makeRepository(playlists);
    const provider = {
      listLibraryPlaylistIds: jest.fn().mockResolvedValue(new Set(['sp2'])),
      getPlaylistSnapshot: jest.fn().mockImplementation((id: string) =>
        Promise.resolve(
          id === 'sp2'
            ? {
                name: 'Mix two',
                url: 'https://open.spotify.com/playlist/sp2',
                trackCount: 0,
                totalDurationMs: 0,
                tracks: [],
              }
            : null,
        ),
      ),
    };

    const result = await new SyncLibraryUseCase(
      repository,
      makeFactory(provider),
    ).execute('user-1');

    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith('user-1', [
      'playlist-1',
      'playlist-3',
    ]);
    expect(result.removedCount).toBe(2);
    expect(result.checkedCount).toBe(3);
  });

  it('reports removedCount 0 when every playlist still exists on Spotify', async () => {
    const playlists = [
      makePlaylist('playlist-1', 'sp1', 'Mix one'),
      makePlaylist('playlist-2', 'sp2', 'Mix two'),
    ];
    const { repository, deleteMany } = makeRepository(playlists);
    const provider = {
      listLibraryPlaylistIds: jest
        .fn()
        .mockResolvedValue(new Set(['sp1', 'sp2'])),
      getPlaylistSnapshot: jest.fn().mockResolvedValue({
        name: 'Still there',
        url: 'https://open.spotify.com/playlist/sp',
        trackCount: 0,
        totalDurationMs: 0,
        tracks: [],
      }),
    };

    const result = await new SyncLibraryUseCase(
      repository,
      makeFactory(provider),
    ).execute('user-1');

    expect(deleteMany).not.toHaveBeenCalled();
    expect(result.removedCount).toBe(0);
  });

  it('rethrows a Spotify quota error from listLibraryPlaylistIds and deletes nothing', async () => {
    const playlist = makePlaylist('playlist-1', 'sp1', 'Evening mix');
    const { repository, deleteMany } = makeRepository([playlist]);
    const provider = {
      listLibraryPlaylistIds: jest
        .fn()
        .mockRejectedValue(
          new BusinessRuleError('quota', 'SPOTIFY_QUOTA_EXCEEDED'),
        ),
      getPlaylistSnapshot: jest.fn(),
    };

    await expect(
      new SyncLibraryUseCase(repository, makeFactory(provider)).execute(
        'user-1',
      ),
    ).rejects.toMatchObject({ code: 'SPOTIFY_QUOTA_EXCEEDED' });
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('rethrows a Spotify quota error from getPlaylistSnapshot and does not apply deletions already determined earlier in the pass', async () => {
    const playlists = [
      makePlaylist('playlist-1', 'sp1', 'Mix one'),
      makePlaylist('playlist-2', 'sp2', 'Mix two'),
    ];
    const { repository, deleteMany } = makeRepository(playlists);
    const provider = {
      listLibraryPlaylistIds: jest.fn().mockResolvedValue(new Set()),
      getPlaylistSnapshot: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(
          new BusinessRuleError('quota', 'SPOTIFY_QUOTA_EXCEEDED'),
        ),
    };

    await expect(
      new SyncLibraryUseCase(repository, makeFactory(provider)).execute(
        'user-1',
      ),
    ).rejects.toMatchObject({ code: 'SPOTIFY_QUOTA_EXCEEDED' });
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('continues syncing without deleting anything when listing library ids fails non-quota', async () => {
    const playlist = makePlaylist('playlist-1', 'sp1', 'Evening mix');
    const { repository, deleteMany } = makeRepository([playlist]);
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

    const result = await new SyncLibraryUseCase(
      repository,
      makeFactory(provider),
    ).execute('user-1');

    expect(deleteMany).not.toHaveBeenCalled();
    expect(result.removedCount).toBe(0);
  });

  it('skips already-missing and not-yet-completed playlists', async () => {
    const missing = makePlaylist('playlist-1', 'sp1', 'Already missing');
    missing.markMissingOnSpotify();
    const pending = Playlist.create({
      id: 'playlist-2',
      userId: 'user-1',
      name: 'Pending',
      seeds: [{ type: 'artist', id: 'artist-2', name: 'Pending' }],
      tracks: [],
      generation: {
        kind: 'artist_mix',
        version: 1,
        popularity: PopularityMode.BALANCED,
        orderMode: TrackOrderMode.ARTIST,
        tracksPerSeed: 10,
        seeds: [{ id: 'artist-2', name: 'Pending' }],
      },
    });
    const { repository, deleteMany } = makeRepository([missing, pending]);
    const getPlaylistSnapshot = jest.fn();
    const provider = {
      listLibraryPlaylistIds: jest.fn().mockResolvedValue(new Set(['sp1'])),
      getPlaylistSnapshot,
    };

    const result = await new SyncLibraryUseCase(
      repository,
      makeFactory(provider),
    ).execute('user-1');

    expect(getPlaylistSnapshot).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(result.checkedCount).toBe(2);
    expect(result.removedCount).toBe(0);
  });
});
