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
