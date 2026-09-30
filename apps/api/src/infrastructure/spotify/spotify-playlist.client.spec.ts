import type { SpotifyApiClient } from './spotify-api.client';
import { SpotifyPlaylistClient } from './spotify-playlist.client';

function createApi(items: unknown[]) {
  const raw = jest.fn((_token: string, config: { url?: string }) =>
    Promise.resolve({
      data: config.url?.endsWith('/items')
        ? { items, total: items.length, next: null }
        : { id: 'playlist-1', name: 'Mix', items: { total: items.length } },
    }),
  );
  const api = {
    raw,
    accessToken: jest.fn(() => Promise.resolve('user-token')),
    isStatus: () => false,
    toSpotifyError: (_operation: string, error: unknown) => error,
  } as unknown as SpotifyApiClient;
  return api;
}

describe('SpotifyPlaylistClient.getPlaylistSnapshot', () => {
  it('maps portable metadata of playlist items', async () => {
    const api = createApi([
      {
        item: {
          id: 'track-1',
          name: 'Stay',
          uri: 'spotify:track:track-1',
          duration_ms: 141_000,
          artists: [
            { id: 'kid-id', name: 'The Kid LAROI' },
            { id: 'bieber-id', name: 'Justin Bieber' },
          ],
          external_ids: { isrc: 'USUM72105936' },
          external_urls: { spotify: 'https://open.spotify.com/track/track-1' },
        },
      },
    ]);

    const snapshot = await new SpotifyPlaylistClient(
      'user-1',
      api,
    ).getPlaylistSnapshot('playlist-1');
    const [track] = snapshot?.tracks ?? [];

    expect(track.artistId.getValue()).toBe('kid-id');
    expect(track.artists).toEqual([
      { id: 'kid-id', name: 'The Kid LAROI' },
      { id: 'bieber-id', name: 'Justin Bieber' },
    ]);
    expect(track.isrc).toBe('USUM72105936');
    expect(track.externalUrl).toBe('https://open.spotify.com/track/track-1');
    expect(track.popularity).toBeNull();
  });

  it('keeps playlist-item popularity of 73, zero, and omitted distinct', async () => {
    const api = createApi([
      {
        item: {
          id: 'high',
          name: 'High',
          uri: 'spotify:track:high',
          duration_ms: 1_000,
          popularity: 73,
          artists: [{ id: 'artist-1', name: 'Artist' }],
        },
      },
      {
        item: {
          id: 'zero',
          name: 'Zero',
          uri: 'spotify:track:zero',
          duration_ms: 1_000,
          popularity: 0,
          artists: [{ id: 'artist-1', name: 'Artist' }],
        },
      },
      {
        item: {
          id: 'missing',
          name: 'Missing',
          uri: 'spotify:track:missing',
          duration_ms: 1_000,
          artists: [{ id: 'artist-1', name: 'Artist' }],
        },
      },
    ]);

    const snapshot = await new SpotifyPlaylistClient(
      'user-1',
      api,
    ).getPlaylistSnapshot('playlist-1');

    expect(snapshot?.tracks?.map((track) => track.popularity)).toEqual([
      73,
      0,
      null,
    ]);
  });

  it('falls back to the attributed artist when credits are unusable', async () => {
    const api = createApi([
      {
        track: {
          id: 'track-2',
          name: 'Local',
          uri: 'spotify:track:track-2',
          duration_ms: 1_000,
          artists: [{ name: '  ' }],
        },
      },
    ]);

    const snapshot = await new SpotifyPlaylistClient(
      'user-1',
      api,
    ).getPlaylistSnapshot('playlist-1');
    const [track] = snapshot?.tracks ?? [];

    expect(track.artists).toEqual([{ id: 'unknown', name: 'Unknown Artist' }]);
    expect(track.isrc).toBeUndefined();
    expect(track.externalUrl).toBeUndefined();
  });
});

describe('SpotifyPlaylistClient.getPlaylistSnapshot error handling', () => {
  function createFailingApi(status: number) {
    const error = Object.assign(new Error(`status ${status}`), { status });
    const raw = jest.fn(() => Promise.reject(error));
    return {
      raw,
      accessToken: jest.fn(() => Promise.resolve('user-token')),
      isStatus: (err: unknown, ...statuses: number[]) =>
        statuses.includes((err as { status: number }).status),
      toSpotifyError: (_operation: string, err: unknown) =>
        new Error(`spotify error: ${(err as { status: number }).status}`),
    } as unknown as SpotifyApiClient;
  }

  it('returns null on a 404 (confirmed gone)', async () => {
    const api = createFailingApi(404);
    const snapshot = await new SpotifyPlaylistClient(
      'user-1',
      api,
    ).getPlaylistSnapshot('playlist-1');

    expect(snapshot).toBeNull();
  });

  it('throws on a 403 instead of treating it as gone', async () => {
    const api = createFailingApi(403);

    await expect(
      new SpotifyPlaylistClient('user-1', api).getPlaylistSnapshot(
        'playlist-1',
      ),
    ).rejects.toThrow('spotify error: 403');
  });
});

describe('SpotifyPlaylistClient.listLibraryPlaylistIds', () => {
  function createPaginatedApi(totalPlaylists: number, pageSize: number) {
    const raw = jest.fn(
      (_token: string, config: { params?: { offset?: number } }) => {
        const offset = config.params?.offset ?? 0;
        const remaining = Math.max(totalPlaylists - offset, 0);
        const items = Array.from(
          { length: Math.min(pageSize, remaining) },
          (_, i) => ({ id: `playlist-${offset + i}` }),
        );
        const nextOffset = offset + items.length;
        return Promise.resolve({
          data: {
            items,
            total: totalPlaylists,
            next: nextOffset < totalPlaylists ? `offset=${nextOffset}` : null,
          },
        });
      },
    );
    return {
      raw,
      request: async (
        _operation: string,
        token: string,
        config: { params?: { offset?: number } },
      ) => (await raw(token, config)).data,
      accessToken: jest.fn(() => Promise.resolve('user-token')),
      isStatus: () => false,
      toSpotifyError: (_operation: string, error: unknown) => error,
    } as unknown as SpotifyApiClient;
  }

  it('paginates past the first page and includes a playlist that only appears later', async () => {
    const api = createPaginatedApi(120, 50);
    const client = new SpotifyPlaylistClient('user-1', api);

    const ids = await client.listLibraryPlaylistIds();

    expect(ids.size).toBe(120);
    expect(ids.has('playlist-0')).toBe(true);
    expect(ids.has('playlist-119')).toBe(true);
  });

  it('throws instead of returning a partial set when the page cap is hit with more data remaining', async () => {
    const raw = jest.fn((_token: string, _config: unknown) =>
      Promise.resolve({
        data: {
          items: [{ id: 'playlist-x' }],
          total: 100_000,
          next: 'offset=50',
        },
      }),
    );
    const api = {
      raw,
      request: async (_operation: string, token: string, config: unknown) =>
        (await raw(token, config)).data,
      accessToken: jest.fn(() => Promise.resolve('user-token')),
      isStatus: () => false,
      toSpotifyError: (_operation: string, error: unknown) => error,
    } as unknown as SpotifyApiClient;
    const client = new SpotifyPlaylistClient('user-1', api);

    await expect(client.listLibraryPlaylistIds()).rejects.toThrow();
  });
});

describe('SpotifyPlaylistClient.createPlaylist', () => {
  function clientReturning(data: unknown) {
    const request = jest.fn(() => Promise.resolve(data));
    const api = {
      request,
      accessToken: jest.fn(() => Promise.resolve('user-token')),
    } as unknown as SpotifyApiClient;
    return { client: new SpotifyPlaylistClient('user-1', api), request };
  }

  it('returns the created playlist id and link', async () => {
    const { client, request } = clientReturning({
      id: 'created-1',
      external_urls: { spotify: 'https://open.spotify.com/playlist/created-1' },
    });

    await expect(
      client.createPlaylist({ userId: 'u', name: 'Mix', description: '' }),
    ).resolves.toEqual({
      id: 'created-1',
      url: 'https://open.spotify.com/playlist/created-1',
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('treats a success response without a playlist id as an unknown outcome', async () => {
    const { client, request } = clientReturning({});

    await expect(
      client.createPlaylist({ userId: 'u', name: 'Mix', description: '' }),
    ).rejects.toMatchObject({
      code: 'SPOTIFY_OUTCOME_UNKNOWN',
      failure: { operation: 'createPlaylist' },
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
