import { PopularityMode, TrackOrderMode } from '@blendify/contracts';
import { GetUserStatsUseCase } from './get-user-stats.use-case';
import { ResetUserStatsUseCase } from './reset-user-stats.use-case';
import { SearchTracksUseCase } from './search-tracks.use-case';
import { RenamePlaylistUseCase } from './rename-playlist.use-case';
import { RemovePlaylistFromLibraryUseCase } from './remove-playlist-from-library.use-case';
import { Playlist } from '../../domain/playlist/playlist.entity';
import { Track } from '../../domain/track/track.entity';
import { ArtistId } from '../../domain/value-objects/artist-id.vo';
import { TrackId } from '../../domain/value-objects/track-id.vo';
import type { PlaylistRepositoryPort } from '../../domain/repositories/playlist.repository.port';
import type { MusicProviderFactoryPort } from '../../domain/repositories/music-provider.factory.port';
import type { UserRepositoryPort } from '../../domain/repositories/user.repository.port';
import type { UsageStatsRepositoryPort } from '../../domain/repositories/usage-stats.repository.port';
import { User } from '../../domain/user/user.entity';

function makeUser(): User {
  return User.create({ id: 'user-1', spotifyId: 's1', displayName: 'Camila' });
}

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

describe('thin application use cases', () => {
  it('GetUserStatsUseCase loads stats for an existing user', async () => {
    const getStats = jest.fn().mockResolvedValue({ uniqueArtists: 2 });
    const users = {
      findById: jest.fn().mockResolvedValue(makeUser()),
    } as unknown as UserRepositoryPort;
    const usage = { getStats } as unknown as UsageStatsRepositoryPort;

    await expect(
      new GetUserStatsUseCase(usage, users).execute('user-1'),
    ).resolves.toEqual({ uniqueArtists: 2 });
    expect(getStats).toHaveBeenCalledWith('user-1', { topLimit: 10 });
  });

  it('GetUserStatsUseCase rejects unknown users', async () => {
    const users = {
      findById: jest.fn().mockResolvedValue(null),
    } as unknown as UserRepositoryPort;
    const usage = {
      getStats: jest.fn(),
    } as unknown as UsageStatsRepositoryPort;

    await expect(
      new GetUserStatsUseCase(usage, users).execute('missing'),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('ResetUserStatsUseCase resets for an existing user', async () => {
    const resetStats = jest.fn().mockResolvedValue(undefined);
    const users = {
      findById: jest.fn().mockResolvedValue(makeUser()),
    } as unknown as UserRepositoryPort;
    const usage = { resetStats } as unknown as UsageStatsRepositoryPort;

    await new ResetUserStatsUseCase(usage, users).execute('user-1');
    expect(resetStats).toHaveBeenCalledWith('user-1');
  });

  it('ResetUserStatsUseCase rejects unknown users', async () => {
    const users = {
      findById: jest.fn().mockResolvedValue(null),
    } as unknown as UserRepositoryPort;
    const usage = {
      resetStats: jest.fn(),
    } as unknown as UsageStatsRepositoryPort;

    await expect(
      new ResetUserStatsUseCase(usage, users).execute('missing'),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('SearchTracksUseCase returns mapped tracks and ignores short queries', async () => {
    const track = Track.create({
      id: TrackId.create('t1'),
      name: 'Smooth Operator',
      artistId: ArtistId.create('a1'),
      artistName: 'Sade',
      durationMs: 1000,
      popularity: 80,
      uri: 'spotify:track:t1',
    });
    const searchTracks = jest.fn().mockResolvedValue([track]);
    const providers = {
      forUser: () => ({ searchTracks }),
    } as unknown as MusicProviderFactoryPort;
    const useCase = new SearchTracksUseCase(providers);

    await expect(useCase.execute('user-1', 'a')).resolves.toEqual([]);
    await expect(useCase.execute('user-1', 'Sade')).resolves.toMatchObject([
      { id: 't1', name: 'Smooth Operator' },
    ]);
  });

  it('RenamePlaylistUseCase renames locally and syncs Spotify when linked', async () => {
    const playlist = makePlaylist();
    playlist.linkToSpotify('sp1', 'https://open.spotify.com/playlist/sp1');
    const save = jest
      .fn()
      .mockImplementation((p: Playlist) => Promise.resolve(p));
    const updatePlaylistDetails = jest.fn().mockResolvedValue(undefined);
    const playlists = {
      findById: jest.fn().mockResolvedValue(playlist),
      save,
    } as unknown as PlaylistRepositoryPort;
    const providers = {
      forUser: () => ({ updatePlaylistDetails }),
    } as unknown as MusicProviderFactoryPort;

    const detail = await new RenamePlaylistUseCase(
      playlists,
      providers,
    ).execute('user-1', 'playlist-1', 'Renamed');

    expect(detail.name).toBe('Renamed');
    expect(updatePlaylistDetails).toHaveBeenCalledWith('sp1', {
      name: 'Renamed',
    });
    expect(save).toHaveBeenCalled();
  });

  it('RenamePlaylistUseCase rejects playlists the user does not own', async () => {
    const playlists = {
      findById: jest.fn().mockResolvedValue(null),
    } as unknown as PlaylistRepositoryPort;
    const providers = {
      forUser: jest.fn(),
    } as unknown as MusicProviderFactoryPort;

    await expect(
      new RenamePlaylistUseCase(playlists, providers).execute(
        'user-1',
        'missing',
        'Renamed',
      ),
    ).rejects.toMatchObject({ code: 'PLAYLIST_NOT_FOUND' });
  });

  it('RenamePlaylistUseCase skips the Spotify sync when the playlist is not linked', async () => {
    const playlist = makePlaylist();
    const save = jest
      .fn()
      .mockImplementation((p: Playlist) => Promise.resolve(p));
    const playlists = {
      findById: jest.fn().mockResolvedValue(playlist),
      save,
    } as unknown as PlaylistRepositoryPort;
    const updatePlaylistDetails = jest.fn();
    const providers = {
      forUser: () => ({ updatePlaylistDetails }),
    } as unknown as MusicProviderFactoryPort;

    const detail = await new RenamePlaylistUseCase(
      playlists,
      providers,
    ).execute('user-1', 'playlist-1', 'Renamed');

    expect(detail.name).toBe('Renamed');
    expect(updatePlaylistDetails).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalled();
  });

  it('RenamePlaylistUseCase skips the Spotify sync for a playlist marked missing on Spotify', async () => {
    const playlist = makePlaylist();
    playlist.linkToSpotify('sp1', 'https://open.spotify.com/playlist/sp1');
    playlist.markMissingOnSpotify();
    const save = jest
      .fn()
      .mockImplementation((p: Playlist) => Promise.resolve(p));
    const playlists = {
      findById: jest.fn().mockResolvedValue(playlist),
      save,
    } as unknown as PlaylistRepositoryPort;
    const updatePlaylistDetails = jest.fn();
    const providers = {
      forUser: () => ({ updatePlaylistDetails }),
    } as unknown as MusicProviderFactoryPort;

    const detail = await new RenamePlaylistUseCase(
      playlists,
      providers,
    ).execute('user-1', 'playlist-1', 'Renamed');

    expect(detail.name).toBe('Renamed');
    expect(updatePlaylistDetails).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalled();
  });

  it('RenamePlaylistUseCase saves locally even when the Spotify sync fails', async () => {
    const playlist = makePlaylist();
    playlist.linkToSpotify('sp1', 'https://open.spotify.com/playlist/sp1');
    const save = jest
      .fn()
      .mockImplementation((p: Playlist) => Promise.resolve(p));
    const playlists = {
      findById: jest.fn().mockResolvedValue(playlist),
      save,
    } as unknown as PlaylistRepositoryPort;
    const providers = {
      forUser: () => ({
        updatePlaylistDetails: jest
          .fn()
          .mockRejectedValue(new Error('spotify down')),
      }),
    } as unknown as MusicProviderFactoryPort;

    const detail = await new RenamePlaylistUseCase(
      playlists,
      providers,
    ).execute('user-1', 'playlist-1', 'Renamed');

    expect(detail.name).toBe('Renamed');
    expect(save).toHaveBeenCalled();
  });

  it('RemovePlaylistFromLibraryUseCase deletes Blendify-only entries', async () => {
    const playlist = makePlaylist();
    const del = jest.fn().mockResolvedValue(undefined);
    const playlists = {
      findById: jest.fn().mockResolvedValue(playlist),
      delete: del,
    } as unknown as PlaylistRepositoryPort;
    const providers = {
      forUser: jest.fn(),
    } as unknown as MusicProviderFactoryPort;

    await new RemovePlaylistFromLibraryUseCase(playlists, providers).execute(
      'user-1',
      'playlist-1',
    );
    expect(del).toHaveBeenCalledWith('playlist-1');
  });

  it('RemovePlaylistFromLibraryUseCase purges Spotify then marks missing', async () => {
    const playlist = makePlaylist();
    playlist.linkToSpotify('sp1', 'https://open.spotify.com/playlist/sp1');
    const save = jest
      .fn()
      .mockImplementation((p: Playlist) => Promise.resolve(p));
    const deletePlaylist = jest.fn().mockResolvedValue(undefined);
    const del = jest.fn();
    const playlists = {
      findById: jest.fn().mockResolvedValue(playlist),
      save,
      delete: del,
    } as unknown as PlaylistRepositoryPort;
    const providers = {
      forUser: () => ({ deletePlaylist }),
    } as unknown as MusicProviderFactoryPort;

    await new RemovePlaylistFromLibraryUseCase(playlists, providers).execute(
      'user-1',
      'playlist-1',
      { fromSpotify: true },
    );

    expect(deletePlaylist).toHaveBeenCalledWith('sp1');
    expect(playlist.missingOnSpotify).toBe(true);
    expect(save).toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it('RemovePlaylistFromLibraryUseCase surfaces Spotify purge failures', async () => {
    const playlist = makePlaylist();
    playlist.linkToSpotify('sp1', 'https://open.spotify.com/playlist/sp1');
    const playlists = {
      findById: jest.fn().mockResolvedValue(playlist),
      save: jest.fn(),
    } as unknown as PlaylistRepositoryPort;
    const providers = {
      forUser: () => ({
        deletePlaylist: jest.fn().mockRejectedValue(new Error('spotify down')),
      }),
    } as unknown as MusicProviderFactoryPort;

    await expect(
      new RemovePlaylistFromLibraryUseCase(playlists, providers).execute(
        'user-1',
        'playlist-1',
        { fromSpotify: true },
      ),
    ).rejects.toThrow('spotify down');
  });

  it('RemovePlaylistFromLibraryUseCase stringifies a non-Error Spotify purge failure', async () => {
    const playlist = makePlaylist();
    playlist.linkToSpotify('sp1', 'https://open.spotify.com/playlist/sp1');
    const playlists = {
      findById: jest.fn().mockResolvedValue(playlist),
      save: jest.fn(),
    } as unknown as PlaylistRepositoryPort;
    const providers = {
      forUser: () => ({
        deletePlaylist: jest.fn().mockRejectedValue('spotify down'),
      }),
    } as unknown as MusicProviderFactoryPort;

    await expect(
      new RemovePlaylistFromLibraryUseCase(playlists, providers).execute(
        'user-1',
        'playlist-1',
        { fromSpotify: true },
      ),
    ).rejects.toBe('spotify down');
  });

  it('RemovePlaylistFromLibraryUseCase rejects foreign playlists', async () => {
    const playlists = {
      findById: jest.fn().mockResolvedValue(null),
    } as unknown as PlaylistRepositoryPort;

    await expect(
      new RemovePlaylistFromLibraryUseCase(playlists, {
        forUser: jest.fn(),
      }).execute('user-1', 'missing'),
    ).rejects.toMatchObject({ code: 'PLAYLIST_NOT_FOUND' });
  });
});
