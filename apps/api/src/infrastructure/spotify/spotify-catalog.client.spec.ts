import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import { CatalogUnavailableError } from '../../domain/errors/catalog-unavailable.error';
import type { RedisCacheService } from '../cache/redis-cache.service';
import {
  SpotifyCatalogClient,
  type CatalogTokenSource,
} from './spotify-catalog.client';
import type { SpotifyApiClient } from './spotify-api.client';

type RawRequest = { params?: Record<string, unknown>; url?: string };

function createApi(data: unknown = { artists: { items: [] } }) {
  const raw = jest.fn((_token: string, _config: RawRequest) =>
    Promise.resolve({ data }),
  );
  const accessToken = jest.fn();
  const api = {
    raw,
    accessToken,
    isStatus: (error: unknown, ...statuses: number[]) =>
      error instanceof AxiosError &&
      statuses.includes(error.response?.status ?? 0),
    toSpotifyError: (operation: string, error: unknown) =>
      error instanceof AxiosError && error.response?.status === 429
        ? new BusinessRuleError('Spotify rate limit.', 'SPOTIFY_RATE_LIMITED')
        : new Error(`Spotify ${operation} failed`),
  } as unknown as SpotifyApiClient;
  return { api, raw, accessToken };
}

function httpError(status: number): AxiosError {
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', undefined, {}, {
    status,
    statusText: 'error',
    headers: AxiosHeaders.from({}),
    data: {},
  } as AxiosResponse);
}

function networkError(): AxiosError {
  return new AxiosError('socket hang up', 'ECONNRESET');
}

function createTokens(...issued: string[]) {
  const queue = issued.length > 0 ? issued : ['app-token'];
  let index = 0;
  const tokens = {
    getAccessToken: jest.fn(() =>
      Promise.resolve(queue[Math.min(index++, queue.length - 1)]),
    ),
    invalidate: jest.fn(),
  } satisfies CatalogTokenSource;
  return tokens;
}

function createCache() {
  const store = new Map<string, unknown>();
  const cache = {
    getJson: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setJson: jest.fn((key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    }),
  } as unknown as RedisCacheService;
  return { cache, store };
}

describe('SpotifyCatalogClient', () => {
  it('authenticates catalog calls with the application token only', async () => {
    const { api, raw, accessToken } = createApi();
    const tokens = createTokens('app-token');

    await new SpotifyCatalogClient(api, tokens, 'AR').searchArtists('Sade');

    expect(tokens.getAccessToken).toHaveBeenCalledTimes(1);
    expect(raw).toHaveBeenCalledWith('app-token', expect.anything());
    expect(accessToken).not.toHaveBeenCalled();
  });

  it('sends the market to search requests when one is set', async () => {
    const { api, raw } = createApi({ tracks: { items: [] } });
    const client = new SpotifyCatalogClient(api, createTokens(), 'AR');

    await client.searchTracks('Sade');
    await client.resolveTrack('Sade', 'Smooth Operator');

    for (const [, config] of raw.mock.calls) {
      expect(config.params).toMatchObject({ market: 'AR' });
    }
  });

  it('keeps search caches separate per market', async () => {
    const { api, raw } = createApi();
    const { cache, store } = createCache();
    const tokens = createTokens();

    await new SpotifyCatalogClient(api, tokens, 'AR', cache).searchArtists(
      'Sade',
    );
    await new SpotifyCatalogClient(api, tokens, 'AR', cache).searchArtists(
      'Sade',
    );
    await new SpotifyCatalogClient(api, tokens, 'BR', cache).searchArtists(
      'Sade',
    );

    expect(raw).toHaveBeenCalledTimes(2);
    expect([...store.keys()]).toEqual([
      'spotify:search-artists:AR:sade:10',
      'spotify:search-artists:BR:sade:10',
    ]);
  });

  it('retries once with a fresh token after the application token is rejected', async () => {
    const { api, raw } = createApi({
      artists: { items: [{ id: 'sade', name: 'Sade' }] },
    });
    raw.mockRejectedValueOnce(httpError(401));
    const tokens = createTokens('expired-token', 'fresh-token');

    const artists = await new SpotifyCatalogClient(
      api,
      tokens,
      'AR',
    ).searchArtists('Sade');

    expect(artists.map((artist) => artist.name)).toEqual(['Sade']);
    expect(tokens.invalidate).toHaveBeenCalledTimes(1);
    expect(tokens.invalidate).toHaveBeenCalledWith('expired-token');
    expect(raw.mock.calls.map(([token]) => token)).toEqual([
      'expired-token',
      'fresh-token',
    ]);
  });

  it('reports the catalog as unavailable after a second rejection without retrying again', async () => {
    const { api, raw } = createApi();
    raw.mockRejectedValue(httpError(401));
    const tokens = createTokens('expired-token', 'fresh-token');

    await expect(
      new SpotifyCatalogClient(api, tokens, 'AR').searchArtists('Sade'),
    ).rejects.toBeInstanceOf(CatalogUnavailableError);
    expect(raw).toHaveBeenCalledTimes(2);
    expect(tokens.invalidate.mock.calls).toEqual([
      ['expired-token'],
      ['fresh-token'],
    ]);
  });

  it('reports the catalog as unavailable when the application token cannot be acquired', async () => {
    const { api, raw } = createApi();
    const tokens = createTokens();
    tokens.getAccessToken.mockRejectedValue(
      new Error('Spotify app token request failed (503)'),
    );
    const client = new SpotifyCatalogClient(api, tokens, 'AR');

    await expect(client.searchArtists('Sade')).rejects.toBeInstanceOf(
      CatalogUnavailableError,
    );
    await expect(
      client.resolveTrack('Sade', 'Smooth Operator'),
    ).rejects.toBeInstanceOf(CatalogUnavailableError);
    expect(raw).not.toHaveBeenCalled();
  });

  it('keeps a token endpoint rate limit as the Spotify quota error', async () => {
    const { api } = createApi();
    const tokens = createTokens();
    tokens.getAccessToken.mockRejectedValue(
      new BusinessRuleError('Spotify rate limit.', 'SPOTIFY_RATE_LIMITED'),
    );

    await expect(
      new SpotifyCatalogClient(api, tokens, 'AR').searchArtists('Sade'),
    ).rejects.toMatchObject({ code: 'SPOTIFY_RATE_LIMITED' });
  });

  it.each([
    ['HTTP 403', () => httpError(403)],
    ['HTTP 500', () => httpError(500)],
    ['HTTP 503', () => httpError(503)],
    ['a network failure', networkError],
  ])(
    'reports the catalog as unavailable on %s without retrying',
    async (_, makeError) => {
      const { api, raw } = createApi();
      raw.mockRejectedValueOnce(makeError());
      const tokens = createTokens();

      await expect(
        new SpotifyCatalogClient(api, tokens, 'AR').searchArtists('Sade'),
      ).rejects.toBeInstanceOf(CatalogUnavailableError);
      expect(raw).toHaveBeenCalledTimes(1);
      expect(tokens.invalidate).not.toHaveBeenCalled();
    },
  );

  it.each([400, 404])(
    'keeps HTTP %i as an ordinary request failure without retrying',
    async (status) => {
      const { api, raw } = createApi();
      raw.mockRejectedValueOnce(httpError(status));
      const tokens = createTokens();

      await expect(
        new SpotifyCatalogClient(api, tokens, 'AR').searchArtists('Sade'),
      ).rejects.toThrow('Spotify searchArtists failed');
      expect(raw).toHaveBeenCalledTimes(1);
      expect(tokens.invalidate).not.toHaveBeenCalled();
    },
  );

  it('keeps HTTP 429 as the Spotify quota error without retrying', async () => {
    const { api, raw } = createApi();
    raw.mockRejectedValueOnce(httpError(429));
    const tokens = createTokens();

    await expect(
      new SpotifyCatalogClient(api, tokens, 'AR').searchArtists('Sade'),
    ).rejects.toMatchObject({ code: 'SPOTIFY_RATE_LIMITED' });
    expect(raw).toHaveBeenCalledTimes(1);
    expect(tokens.invalidate).not.toHaveBeenCalled();
  });

  it('fetches uncached artists one by one through the single-artist endpoint', async () => {
    const { api, raw } = createApi({ id: 'sade', name: 'Sade' });

    await new SpotifyCatalogClient(api, createTokens(), 'AR').getArtistsByIds([
      'sade',
      'prince',
    ]);

    expect(raw.mock.calls.map(([, config]) => config.url)).toEqual([
      '/artists/sade',
      '/artists/prince',
    ]);
    for (const [, config] of raw.mock.calls) {
      expect(config.params).toBeUndefined();
    }
  });
});

describe('SpotifyCatalogClient.searchTracks portable metadata', () => {
  const spotifyTrack = {
    id: 'track-1',
    name: 'Stay',
    duration_ms: 141_000,
    uri: 'spotify:track:track-1',
    artists: [
      { id: 'kid-id', name: 'The Kid LAROI' },
      { id: 'bieber-id', name: 'Justin Bieber' },
    ],
    external_ids: { isrc: 'usum72105936' },
    external_urls: { spotify: 'https://open.spotify.com/track/track-1' },
  };

  it('maps credited artists, isrc and external url', async () => {
    const { api } = createApi({ tracks: { items: [spotifyTrack] } });
    const client = new SpotifyCatalogClient(api, createTokens(), 'AR');

    const [track] = await client.searchTracks('Stay');

    expect(track.artistId.getValue()).toBe('kid-id');
    expect(track.artists).toEqual([
      { id: 'kid-id', name: 'The Kid LAROI' },
      { id: 'bieber-id', name: 'Justin Bieber' },
    ]);
    expect(track.isrc).toBe('USUM72105936');
    expect(track.externalUrl).toBe('https://open.spotify.com/track/track-1');
  });

  it('maps a track without optional portable metadata', async () => {
    const { api } = createApi({
      tracks: {
        items: [
          {
            ...spotifyTrack,
            artists: [{ id: 'kid-id', name: 'The Kid LAROI' }],
            external_ids: {},
            external_urls: undefined,
          },
        ],
      },
    });
    const client = new SpotifyCatalogClient(api, createTokens(), 'AR');

    const [track] = await client.searchTracks('Stay');

    expect(track.artists).toEqual([{ id: 'kid-id', name: 'The Kid LAROI' }]);
    expect(track.isrc).toBeUndefined();
    expect(track.externalUrl).toBeUndefined();
  });

  it('round-trips portable metadata through the search cache', async () => {
    const { api, raw } = createApi({ tracks: { items: [spotifyTrack] } });
    const { cache } = createCache();
    const client = new SpotifyCatalogClient(api, createTokens(), 'AR', cache);

    await client.searchTracks('Stay');
    const [cached] = await client.searchTracks('Stay');

    expect(raw).toHaveBeenCalledTimes(1);
    expect(cached.artists).toEqual([
      { id: 'kid-id', name: 'The Kid LAROI' },
      { id: 'bieber-id', name: 'Justin Bieber' },
    ]);
    expect(cached.isrc).toBe('USUM72105936');
    expect(cached.externalUrl).toBe('https://open.spotify.com/track/track-1');
  });

  it('hydrates cache entries written before portable metadata existed', async () => {
    const { api, raw } = createApi();
    const { cache, store } = createCache();
    store.set('spotify:search-tracks:AR:stay:10:0', [
      {
        id: 'track-1',
        name: 'Stay',
        artistId: 'kid-id',
        artistName: 'The Kid LAROI',
        durationMs: 141_000,
        popularity: 0,
        uri: 'spotify:track:track-1',
      },
    ]);
    const client = new SpotifyCatalogClient(api, createTokens(), 'AR', cache);

    const [track] = await client.searchTracks('Stay');

    expect(raw).not.toHaveBeenCalled();
    expect(track.artists).toEqual([{ id: 'kid-id', name: 'The Kid LAROI' }]);
    expect(track.isrc).toBeUndefined();
    expect(track.externalUrl).toBeUndefined();
  });
});

describe('SpotifyCatalogClient.resolveTrack', () => {
  it('attributes collaborations to the selected Spotify artist id', async () => {
    const { api } = createApi({
      tracks: {
        items: [
          {
            id: 'track-1',
            name: 'Mercy',
            duration_ms: 200_000,
            popularity: 70,
            uri: 'spotify:track:track-1',
            artists: [
              { id: 'guest-id', name: 'Guest' },
              { id: 'duffy-id', name: 'Duffy' },
            ],
          },
        ],
      },
    });
    const client = new SpotifyCatalogClient(api, createTokens(), 'AR');

    const track = await client.resolveTrack('Duffy', 'Mercy', {
      artistId: 'duffy-id',
    });

    expect(track?.artistId.getValue()).toBe('duffy-id');
    expect(track?.artistName).toBe('Duffy');
    expect(track?.artists).toEqual([
      { id: 'guest-id', name: 'Guest' },
      { id: 'duffy-id', name: 'Duffy' },
    ]);
  });

  it('returns null for a successful search without a usable match', async () => {
    const { api } = createApi({ tracks: { items: [] } });
    const client = new SpotifyCatalogClient(api, createTokens(), 'AR');

    await expect(
      client.resolveTrack('Sade', 'Unknown Song'),
    ).resolves.toBeNull();
  });

  it('returns null when Spotify rejects an individual lookup', async () => {
    const { api, raw } = createApi();
    raw.mockRejectedValueOnce(httpError(404));
    const client = new SpotifyCatalogClient(api, createTokens(), 'AR');

    await expect(
      client.resolveTrack('Sade', 'Smooth Operator'),
    ).resolves.toBeNull();
  });

  it('propagates a forbidden lookup as catalog unavailability instead of a missing track', async () => {
    const { api, raw } = createApi();
    raw.mockRejectedValueOnce(httpError(403));
    const client = new SpotifyCatalogClient(api, createTokens(), 'AR');

    await expect(
      client.resolveTrack('Sade', 'Smooth Operator'),
    ).rejects.toBeInstanceOf(CatalogUnavailableError);
  });

  it('propagates catalog unavailability instead of reporting a missing track', async () => {
    const { api, raw } = createApi();
    raw.mockRejectedValue(httpError(401));
    const client = new SpotifyCatalogClient(
      api,
      createTokens('expired-token', 'fresh-token'),
      'AR',
    );

    await expect(
      client.resolveTrack('Sade', 'Smooth Operator'),
    ).rejects.toBeInstanceOf(CatalogUnavailableError);
  });

  it('rejects homonyms when the selected artist id is absent', async () => {
    const { api } = createApi({
      tracks: {
        items: [
          {
            id: 'track-1',
            name: 'Mercy',
            duration_ms: 200_000,
            uri: 'spotify:track:track-1',
            artists: [{ id: 'stephen-id', name: 'Stephen Duffy' }],
          },
        ],
      },
    });
    const client = new SpotifyCatalogClient(api, createTokens(), 'AR');

    await expect(
      client.resolveTrack('Duffy', 'Mercy', { artistId: 'duffy-id' }),
    ).resolves.toBeNull();
  });
});
