import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { SpotifyAppTokenProvider } from './spotify-app-token.provider';

const mockPost = jest.fn();

jest.mock('../http/outbound-http.logging', () => ({
  createOutboundHttp: () => ({ post: mockPost }),
}));

const CONFIG: Record<string, string> = {
  SPOTIFY_CLIENT_ID: 'client-id',
  SPOTIFY_CLIENT_SECRET: 'client-secret',
};

function createProvider(values: Record<string, string> = CONFIG) {
  const config = {
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`Missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
  return new SpotifyAppTokenProvider(config);
}

function tokenResponse(accessToken: string, expiresIn = 3600) {
  return {
    data: {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
    },
  };
}

function httpError(status: number, headers: Record<string, string> = {}) {
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', undefined, {}, {
    status,
    statusText: 'error',
    headers: AxiosHeaders.from(headers),
    data: { error: 'server_error' },
  } as AxiosResponse);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('SpotifyAppTokenProvider', () => {
  const start = new Date('2026-01-01T00:00:00Z').getTime();
  let logError: jest.SpyInstance;

  beforeEach(() => {
    mockPost.mockReset();
    logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    jest.useFakeTimers();
    jest.setSystemTime(start);
  });

  afterEach(() => {
    jest.useRealTimers();
    logError.mockRestore();
  });

  it('requests a client credentials token with basic auth', async () => {
    mockPost.mockResolvedValue(tokenResponse('app-token'));

    await expect(createProvider().getAccessToken()).resolves.toBe('app-token');

    const basic = Buffer.from('client-id:client-secret').toString('base64');
    expect(mockPost).toHaveBeenCalledWith(
      '/api/token',
      'grant_type=client_credentials',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basic}`,
        },
      },
    );
  });

  it('reuses the cached token until shortly before expiry', async () => {
    mockPost.mockResolvedValue(tokenResponse('app-token'));
    const provider = createProvider();

    await provider.getAccessToken();
    jest.setSystemTime(start + 3_539_000);

    await expect(provider.getAccessToken()).resolves.toBe('app-token');
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('refreshes once the expiry skew window is reached', async () => {
    mockPost
      .mockResolvedValueOnce(tokenResponse('first-token'))
      .mockResolvedValueOnce(tokenResponse('second-token'));
    const provider = createProvider();

    await provider.getAccessToken();
    jest.setSystemTime(start + 3_540_000);

    await expect(provider.getAccessToken()).resolves.toBe('second-token');
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it('caps the skew at half of a short token lifetime', async () => {
    mockPost
      .mockResolvedValueOnce(tokenResponse('short-token', 60))
      .mockResolvedValueOnce(tokenResponse('next-token'));
    const provider = createProvider();

    await provider.getAccessToken();
    jest.setSystemTime(start + 29_000);
    await expect(provider.getAccessToken()).resolves.toBe('short-token');

    jest.setSystemTime(start + 30_000);
    await expect(provider.getAccessToken()).resolves.toBe('next-token');
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it('shares one in-flight request between concurrent callers', async () => {
    const pending = deferred<ReturnType<typeof tokenResponse>>();
    mockPost.mockReturnValueOnce(pending.promise);
    const provider = createProvider();

    const calls = [
      provider.getAccessToken(),
      provider.getAccessToken(),
      provider.getAccessToken(),
    ];
    pending.resolve(tokenResponse('shared-token'));

    await expect(Promise.all(calls)).resolves.toEqual([
      'shared-token',
      'shared-token',
      'shared-token',
    ]);
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('rejects every concurrent caller on failure and retries on the next call', async () => {
    const pending = deferred<ReturnType<typeof tokenResponse>>();
    mockPost
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(tokenResponse('recovered-token'));
    const provider = createProvider();

    const first = provider.getAccessToken();
    const second = provider.getAccessToken();
    pending.reject(httpError(503));

    await expect(first).rejects.toThrow(
      'Spotify app token request failed (503)',
    );
    await expect(second).rejects.toThrow(
      'Spotify app token request failed (503)',
    );
    await expect(provider.getAccessToken()).resolves.toBe('recovered-token');
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it('reports network failures without leaking credentials', async () => {
    mockPost.mockRejectedValue(new AxiosError('socket hang up', 'ECONNRESET'));

    const error = await createProvider()
      .getAccessToken()
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toBe('Spotify app token request failed (network error)');
    expect(message).not.toContain('client-secret');
    expect(JSON.stringify(logError.mock.calls)).not.toMatch(
      /client-secret|Y2xpZW50/,
    );
  });

  it('maps a token endpoint rate limit to the Spotify rate limit error', async () => {
    mockPost.mockRejectedValue(httpError(429, { 'retry-after': '12' }));

    await expect(createProvider().getAccessToken()).rejects.toMatchObject({
      code: 'SPOTIFY_RATE_LIMITED',
      details: expect.objectContaining({ retryAfterSeconds: 12 }),
    });
  });

  it.each([
    ['missing access token', { token_type: 'Bearer', expires_in: 3600 }],
    [
      'non-positive lifetime',
      { access_token: 'token', token_type: 'Bearer', expires_in: 0 },
    ],
    [
      'unexpected token type',
      { access_token: 'token', token_type: 'mac', expires_in: 3600 },
    ],
  ])(
    'rejects a malformed response (%s) without caching it',
    async (_, data) => {
      mockPost
        .mockResolvedValueOnce({ data })
        .mockResolvedValueOnce(tokenResponse('valid-token'));
      const provider = createProvider();

      await expect(provider.getAccessToken()).rejects.toThrow(
        'Spotify app token response was malformed',
      );
      await expect(provider.getAccessToken()).resolves.toBe('valid-token');
    },
  );

  it('drops the cached token when that token is invalidated', async () => {
    mockPost
      .mockResolvedValueOnce(tokenResponse('revoked-token'))
      .mockResolvedValueOnce(tokenResponse('fresh-token'));
    const provider = createProvider();

    await provider.getAccessToken();
    provider.invalidate('revoked-token');

    await expect(provider.getAccessToken()).resolves.toBe('fresh-token');
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it('ignores invalidation of a token that is no longer cached', async () => {
    mockPost
      .mockResolvedValueOnce(tokenResponse('old-token', 60))
      .mockResolvedValueOnce(tokenResponse('current-token'));
    const provider = createProvider();

    await provider.getAccessToken();
    jest.setSystemTime(start + 30_000);
    await provider.getAccessToken();
    provider.invalidate('old-token');

    await expect(provider.getAccessToken()).resolves.toBe('current-token');
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it('fails before any request when credentials are not configured', async () => {
    await expect(
      createProvider({ SPOTIFY_CLIENT_ID: 'client-id' }).getAccessToken(),
    ).rejects.toThrow('Missing SPOTIFY_CLIENT_SECRET');
    expect(mockPost).not.toHaveBeenCalled();
  });
});
