import { Logger } from '@nestjs/common';
import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { BusinessRuleError } from '@/domain/errors/business-rule.error';
import { ProviderOutcomeUnknownError } from '@/domain/errors/provider-outcome-unknown.error';
import { SpotifyProviderError } from '@/domain/errors/spotify-provider.error';
import { SpotifyReauthRequiredError } from '@/domain/errors/spotify-reauth-required.error';
import type { SpotifyTokenService } from '@/infrastructure/auth/spotify-token.service';
import {
  SPOTIFY_READ_MAX_ATTEMPTS,
  SpotifyApiClient,
} from './spotify-api.client';
import { __resetSpotifyRateLimitForTests } from './spotify-rate-limit';

const adapter: AxiosAdapter = (config: InternalAxiosRequestConfig) =>
  Promise.resolve({
    data: { artists: { items: [{ name: 'Private Catalog Artist' }] } },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  });

describe('SpotifyApiClient outbound logging', () => {
  afterEach(() => jest.restoreAllMocks());

  async function logLine(options?: { logContent?: boolean }): Promise<string> {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const client = new SpotifyApiClient({} as SpotifyTokenService, options);
    await client.raw('secret-access-token', {
      method: 'GET',
      url: '/search',
      params: { q: 'daft punk', type: 'artist' },
      adapter,
    });
    return String(log.mock.calls[0][0]);
  }

  it('keeps logging response bodies by default', async () => {
    const line = await logLine();

    expect(line).toContain('Private Catalog Artist');
  });

  it('omits response bodies when disabled but keeps request metadata', async () => {
    const line = await logLine({ logContent: false });

    expect(JSON.parse(line)).toEqual({
      type: 'outbound_http',
      method: 'GET',
      url: expect.stringContaining(
        'https://api.spotify.com/v1/search?',
      ) as string,
      status: 200,
      durationMs: expect.any(Number) as number,
    });
    expect(line).not.toContain('Private Catalog Artist');
    expect(line).not.toContain('secret-access-token');
    expect(line).not.toContain('daft');
  });
});

type FakeReply =
  | { status: number; data?: unknown; headers?: Record<string, string> }
  | { networkCode: string };

function fakeSpotify(replies: FakeReply[]) {
  const calls: Array<{ method: string; url: string }> = [];
  const adapter: AxiosAdapter = (config) => {
    calls.push({
      method: (config.method ?? 'get').toUpperCase(),
      url: config.url ?? '',
    });
    const reply = replies[Math.min(calls.length, replies.length) - 1];
    if ('networkCode' in reply) {
      return Promise.reject(
        new AxiosError(reply.networkCode, reply.networkCode, config),
      );
    }
    const response: AxiosResponse = {
      data: reply.data ?? {},
      status: reply.status,
      statusText: String(reply.status),
      headers: AxiosHeaders.from(reply.headers ?? {}),
      config,
    };
    if (reply.status >= 400) {
      return Promise.reject(
        new AxiosError(
          `Request failed with status code ${reply.status}`,
          'ERR_BAD_RESPONSE',
          config,
          undefined,
          response,
        ),
      );
    }
    return Promise.resolve(response);
  };
  return { adapter, calls };
}

function clientFor(
  replies: FakeReply[],
  options: {
    tokenService?: Partial<SpotifyTokenService>;
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
    realSleep?: boolean;
  } = {},
) {
  const fake = fakeSpotify(replies);
  const sleeps: number[] = [];
  const client = new SpotifyApiClient(
    (options.tokenService ?? {
      getValidAccessToken: () => Promise.resolve('user-token'),
    }) as SpotifyTokenService,
    { logContent: false },
    {
      adapter: fake.adapter,
      random: () => 0,
      ...(options.realSleep
        ? {}
        : {
            sleep:
              options.sleep ??
              ((ms: number) => {
                sleeps.push(ms);
                return Promise.resolve();
              }),
          }),
    },
  );
  return { client, calls: fake.calls, sleeps };
}

async function failureOf(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the request to fail');
}

describe('SpotifyApiClient provider failures', () => {
  beforeEach(() => {
    __resetSpotifyRateLimitForTests();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });
  afterEach(() => {
    __resetSpotifyRateLimitForTests();
    jest.restoreAllMocks();
  });

  const search = { method: 'GET', url: '/search' } as const;
  const createPlaylist = {
    method: 'POST',
    url: '/me/playlists',
    data: { name: 'Mix' },
  } as const;

  it('retries a safe read once after a 502 and returns the recovered response', async () => {
    const { client, calls, sleeps } = clientFor([
      { status: 502 },
      { status: 200, data: { ok: true } },
    ]);

    await expect(
      client.request('searchArtists', 'token', search),
    ).resolves.toEqual({
      ok: true,
    });
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([500]);
  });

  it('stops a failing read after the bounded attempts and reports it as transient', async () => {
    const { client, calls, sleeps } = clientFor([{ status: 502 }]);

    const error = await failureOf(() =>
      client.request('searchArtists', 'token', search),
    );

    expect(calls).toHaveLength(SPOTIFY_READ_MAX_ATTEMPTS);
    expect(sleeps).toHaveLength(SPOTIFY_READ_MAX_ATTEMPTS - 1);
    expect(error).toBeInstanceOf(SpotifyProviderError);
    expect(error).toMatchObject({
      code: 'SPOTIFY_UNAVAILABLE',
      failure: {
        operation: 'searchArtists',
        category: 'upstream_error',
        status: 502,
      },
    });
  });

  it('does not retry a read when Spotify asks for a wait longer than the retry budget', async () => {
    const { client, calls } = clientFor([
      { status: 503, headers: { 'retry-after': '60' } },
      { status: 200 },
    ]);

    await expect(
      client.request('searchArtists', 'token', search),
    ).rejects.toMatchObject({ code: 'SPOTIFY_UNAVAILABLE' });
    expect(calls).toHaveLength(1);
  });

  describe('with a controlled clock', () => {
    const now = Date.parse('2026-09-30T12:00:00Z');
    const httpDateIn = (seconds: number) =>
      new Date(now + seconds * 1000).toUTCString();

    beforeEach(() => {
      jest.useFakeTimers({ now });
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it.each([
      ['seconds', '10', 10],
      ['an HTTP date', httpDateIn(30), 30],
    ])(
      'never sends another read at the Blendify backoff when Retry-After in %s exceeds the budget',
      async (_label, retryAfter, expectedWait) => {
        const { client, calls } = clientFor(
          [
            { status: 503, headers: { 'retry-after': retryAfter } },
            { status: 200 },
          ],
          { realSleep: true },
        );

        const outcome = failureOf(() =>
          client.request('searchArtists', 'token', search),
        );
        await jest.advanceTimersByTimeAsync(500);
        expect(calls).toHaveLength(1);
        await jest.advanceTimersByTimeAsync(expectedWait * 1000);
        expect(calls).toHaveLength(1);

        await expect(outcome).resolves.toMatchObject({
          code: 'SPOTIFY_UNAVAILABLE',
          failure: {
            status: 503,
            retryAfterSeconds: expectedWait,
            retryAfterSource: 'spotify',
          },
        });
      },
    );

    it('waits a short HTTP-date Retry-After in full before the single retry', async () => {
      const { client, calls } = clientFor(
        [
          { status: 503, headers: { 'retry-after': httpDateIn(2) } },
          { status: 200, data: { ok: true } },
        ],
        { realSleep: true },
      );

      const outcome = client.request('searchArtists', 'token', search);
      await jest.advanceTimersByTimeAsync(500);
      expect(calls).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(1_499);
      expect(calls).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(1);

      await expect(outcome).resolves.toEqual({ ok: true });
      expect(calls).toHaveLength(2);
    });

    it('uses its own backoff only when Retry-After is absent or invalid', async () => {
      const { client, calls } = clientFor(
        [
          { status: 503, headers: { 'retry-after': 'soon' } },
          { status: 200, data: { ok: true } },
        ],
        { realSleep: true },
      );

      const outcome = client.request('searchArtists', 'token', search);
      await jest.advanceTimersByTimeAsync(499);
      expect(calls).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(1);

      await expect(outcome).resolves.toEqual({ ok: true });
      expect(calls).toHaveLength(2);
      const retryLog = (Logger.prototype.warn as jest.Mock).mock.calls
        .map(([line]) => String(line))
        .find((line) => line.includes('spotify_read_retry'));
      expect(JSON.parse(retryLog ?? '{}')).toMatchObject({
        delayMs: 500,
        delaySource: 'blendify',
      });
    });

    it('keeps a Spotify HTTP-date wait on a 429 as the provider wait', async () => {
      const { client, calls } = clientFor([
        { status: 429, headers: { 'retry-after': httpDateIn(45) } },
      ]);

      const error = await failureOf(() =>
        client.request('searchArtists', 'token', search),
      );

      expect(calls).toHaveLength(1);
      expect(error).toMatchObject({
        details: { retryAfterSeconds: 45, retryAfterSource: 'spotify' },
      });
    });
  });

  it('waits the short Retry-After Spotify gives on a transient read', async () => {
    const { client, calls, sleeps } = clientFor([
      { status: 503, headers: { 'retry-after': '2' } },
      { status: 200, data: {} },
    ]);

    await client.request('searchArtists', 'token', search);

    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([2_000]);
  });

  it('never retries a playlist creation that got a 502 and marks its outcome unknown', async () => {
    const { client, calls, sleeps } = clientFor([
      { status: 502 },
      { status: 201, data: { id: 'duplicate' } },
    ]);

    const error = await failureOf(() =>
      client.request('createPlaylist', 'token', createPlaylist),
    );

    expect(calls).toEqual([{ method: 'POST', url: '/me/playlists' }]);
    expect(sleeps).toEqual([]);
    expect(error).toBeInstanceOf(ProviderOutcomeUnknownError);
    expect(error).toMatchObject({
      code: 'SPOTIFY_OUTCOME_UNKNOWN',
      failure: {
        operation: 'createPlaylist',
        category: 'upstream_error',
        status: 502,
      },
    });
  });

  it.each(['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET'])(
    'treats %s after sending a playlist creation as an unknown outcome',
    async (networkCode) => {
      const { client, calls } = clientFor([{ networkCode }]);

      const error = await failureOf(() =>
        client.request('createPlaylist', 'token', createPlaylist),
      );

      expect(calls).toHaveLength(1);
      expect(error).toBeInstanceOf(ProviderOutcomeUnknownError);
      expect((error as ProviderOutcomeUnknownError).failure?.category).toBe(
        networkCode === 'ECONNRESET' ? 'network' : 'timeout',
      );
    },
  );

  it('reports a creation that never reached Spotify as a safe transient failure', async () => {
    const { client, calls } = clientFor([{ networkCode: 'ECONNREFUSED' }]);

    const error = await failureOf(() =>
      client.request('createPlaylist', 'token', createPlaylist),
    );

    expect(calls).toHaveLength(1);
    expect(error).toBeInstanceOf(SpotifyProviderError);
    expect(error).toMatchObject({
      code: 'SPOTIFY_UNAVAILABLE',
      failure: {
        operation: 'createPlaylist',
        category: 'network',
        status: null,
      },
    });
  });

  it('reports a token refresh failure before a write as not sent', async () => {
    const refreshFailure = new AxiosError('reset', 'ECONNRESET');
    const { client, calls } = clientFor([{ status: 201 }], {
      tokenService: {
        getValidAccessToken: () => Promise.reject(refreshFailure),
      },
    });

    const error = await failureOf(() => client.accessToken('user-1'));

    expect(calls).toHaveLength(0);
    expect(error).toMatchObject({
      code: 'SPOTIFY_UNAVAILABLE',
      failure: { operation: 'refreshAccessToken', category: 'network' },
    });
  });

  it('keeps the Spotify Retry-After on a 429 and fails fast until it expires', async () => {
    const { client, calls } = clientFor([
      { status: 429, headers: { 'retry-after': '7' } },
      { status: 200 },
    ]);

    const first = await failureOf(() =>
      client.request('searchArtists', 'token', search),
    );
    const second = await failureOf(() =>
      client.request('searchArtists', 'token', search),
    );

    expect(calls).toHaveLength(1);
    for (const error of [first, second]) {
      expect(error).toBeInstanceOf(BusinessRuleError);
      expect(error).toMatchObject({
        code: 'SPOTIFY_RATE_LIMITED',
        details: {
          retryAfterSeconds: expect.any(Number) as number,
          retryAfterSource: 'spotify',
        },
      });
    }
    expect((first as BusinessRuleError).details?.retryAfterSeconds).toBe(7);
  });

  it.each([
    ['missing', {}],
    ['invalid', { 'retry-after': 'soon' }],
    ['a date already past', { 'retry-after': 'Wed, 21 Oct 2020 07:28:00 GMT' }],
    ['zero', { 'retry-after': '0' }],
  ])(
    'labels the wait as a Blendify estimate when Retry-After is %s',
    async (_label, headers) => {
      const { client, calls } = clientFor([{ status: 429, headers }]);

      const first = await failureOf(() =>
        client.request('searchArtists', 'token', search),
      );
      const second = await failureOf(() =>
        client.request('searchArtists', 'token', search),
      );

      expect(calls).toHaveLength(1);
      for (const error of [first, second]) {
        expect(error).toMatchObject({
          code: 'SPOTIFY_RATE_LIMITED',
          details: {
            retryAfterSeconds: expect.any(Number) as number,
            retryAfterSource: 'blendify',
          },
        });
      }
    },
  );

  it('does not retry a 429 on a write and reports it as a confirmed rejection', async () => {
    const { client, calls } = clientFor([
      { status: 429, headers: { 'retry-after': '5' } },
    ]);

    await expect(
      client.request('createPlaylist', 'token', createPlaylist),
    ).rejects.toMatchObject({ code: 'SPOTIFY_RATE_LIMITED' });
    expect(calls).toHaveLength(1);
  });

  it('asks to reconnect only for a 401', async () => {
    const unauthorized = clientFor([{ status: 401 }]);
    const forbidden = clientFor([{ status: 403 }]);

    const reauth = await failureOf(() =>
      unauthorized.client.request('createPlaylist', 'token', createPlaylist),
    );
    const denied = await failureOf(() =>
      forbidden.client.request('createPlaylist', 'token', createPlaylist),
    );

    expect(reauth).toBeInstanceOf(SpotifyReauthRequiredError);
    expect(denied).toBeInstanceOf(SpotifyProviderError);
    expect(denied).toMatchObject({
      code: 'SPOTIFY_PERMISSION_DENIED',
      failure: { category: 'forbidden', status: 403 },
    });
    expect(unauthorized.calls).toHaveLength(1);
    expect(forbidden.calls).toHaveLength(1);
  });

  it('reports a missing resource as a rejected request without retrying', async () => {
    const { client, calls } = clientFor([{ status: 404 }]);

    await expect(
      client.request('getArtist', 'token', {
        method: 'GET',
        url: '/artists/x',
      }),
    ).rejects.toMatchObject({
      code: 'SPOTIFY_REQUEST_REJECTED',
      failure: { category: 'rejected', status: 404 },
    });
    expect(calls).toHaveLength(1);
  });

  it('stops during the read backoff when the request is canceled', async () => {
    const controller = new AbortController();
    const { client, calls } = clientFor([{ status: 502 }, { status: 200 }], {
      sleep: (_ms, signal) => {
        controller.abort();
        return signal?.aborted
          ? Promise.reject(new axios.CanceledError())
          : Promise.resolve();
      },
    });

    const error = await failureOf(() =>
      client.request('searchArtists', 'token', {
        ...search,
        signal: controller.signal,
      }),
    );

    expect(axios.isCancel(error)).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('cancels the real backoff timer without sending another attempt', async () => {
    const controller = new AbortController();
    const { client, calls } = clientFor([{ status: 502 }, { status: 200 }], {
      realSleep: true,
    });
    setTimeout(() => controller.abort(), 20);

    const error = await failureOf(() =>
      client.request('searchArtists', 'token', {
        ...search,
        signal: controller.signal,
      }),
    );

    expect(axios.isCancel(error)).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('logs operation, status, category and correlation without credentials', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { client } = clientFor([{ status: 502 }]);

    await failureOf(() =>
      client.request('createPlaylist', 'secret-access-token', createPlaylist),
    );

    const line = String(error.mock.calls.at(-1)?.[0]);
    expect(JSON.parse(line)).toEqual({
      event: 'spotify_request_failed',
      method: 'POST',
      operation: 'createPlaylist',
      category: 'upstream_error',
      status: 502,
      reason: null,
      requestId: null,
    });
    expect(line).not.toContain('secret-access-token');
  });
});
