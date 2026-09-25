import { Logger } from '@nestjs/common';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import type { TransferPlaylist } from '../../domain/transfer/transfer-playlist';
import {
  isSafeShareUrl,
  sanitizeRetryAfter,
  SOUNDIIZ_IMPORT_URL,
  SOUNDIIZ_TIMEOUT_MS,
  SoundiizPlaylistTransferAdapter,
} from './soundiiz-playlist-transfer.adapter';

const mockPost = jest.fn<Promise<unknown>, [string, unknown]>();
const mockCreateOutboundHttp = jest.fn((..._args: unknown[]) => ({
  post: mockPost,
}));

jest.mock('../http/outbound-http.logging', () => ({
  createOutboundHttp: (...args: unknown[]) => mockCreateOutboundHttp(...args),
}));

const NOW = new Date('2026-09-25T12:00:00.000Z');
const NOW_SECONDS = NOW.getTime() / 1000;
const SHARE_URL =
  'https://soundiiz.com/go/import-playlist/0123456789abcdef0123456789abcdef';

const playlist: TransferPlaylist = {
  title: 'Blendify · Mix · Daft Punk',
  description: 'Made with Blendify from Daft Punk.',
  tracks: [
    {
      title: 'Get Lucky',
      artists: ['Daft Punk', 'Pharrell Williams'],
      isrc: 'USQX91300105',
    },
    { title: 'One More Time', artists: ['Daft Punk'] },
  ],
};

function success(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      status: 'success',
      nbTracks: 2,
      shareUrl: SHARE_URL,
      expiresAt: NOW_SECONDS + 24 * 60 * 60,
      ...overrides,
    },
  };
}

function httpError(
  status: number,
  headers: Record<string, string> = {},
  data: unknown = {
    status: 'error',
    message: 'Missing track title at index 1.',
  },
) {
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', undefined, {}, {
    status,
    statusText: '',
    data,
    headers,
    config: { headers: new AxiosHeaders() },
  } as AxiosResponse);
}

function networkError(code: string) {
  return new AxiosError('failed', code);
}

describe('SoundiizPlaylistTransferAdapter', () => {
  let log: jest.SpiedFunction<typeof Logger.prototype.log>;
  let warn: jest.SpiedFunction<typeof Logger.prototype.warn>;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    mockPost.mockReset();
    mockCreateOutboundHttp.mockClear();
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function loggedLines(): string {
    return [...log.mock.calls, ...warn.mock.calls]
      .map(([line]) => String(line))
      .join('\n');
  }

  function expectNoSensitiveLogs() {
    const lines = loggedLines();
    for (const secret of [
      'Get Lucky',
      'Pharrell Williams',
      'USQX91300105',
      'Blendify · Mix',
      '0123456789abcdef',
      'Missing track title',
    ]) {
      expect(lines).not.toContain(secret);
    }
  }

  it('uses an explicit timeout, no redirects, and no body logging', () => {
    new SoundiizPlaylistTransferAdapter();

    expect(mockCreateOutboundHttp).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: SOUNDIIZ_TIMEOUT_MS,
        maxRedirects: 0,
      }),
      { logBodies: false },
    );
    expect(SOUNDIIZ_TIMEOUT_MS).toBe(10_000);
  });

  it('posts only the documented minimal payload', async () => {
    mockPost.mockResolvedValue(success());

    await new SoundiizPlaylistTransferAdapter().createTransfer(playlist);

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith(SOUNDIIZ_IMPORT_URL, {
      title: 'Blendify · Mix · Daft Punk',
      sourceName: 'Blendify',
      description: 'Made with Blendify from Daft Punk.',
      tracklist: [
        {
          title: 'Get Lucky',
          artists: ['Daft Punk', 'Pharrell Williams'],
          isrc: 'USQX91300105',
        },
        { title: 'One More Time', artists: ['Daft Punk'] },
      ],
    });
    const [, body] = mockPost.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    for (const field of ['destination', 'sourceLogo', 'album']) {
      expect(JSON.stringify(body)).not.toContain(`"${field}"`);
    }
  });

  it('omits an empty description', async () => {
    mockPost.mockResolvedValue(success({ nbTracks: 1 }));

    await new SoundiizPlaylistTransferAdapter().createTransfer({
      title: 'Solo',
      tracks: [{ title: 'Song', artists: ['Artist'] }],
    });

    expect(mockPost.mock.calls[0][1]).not.toHaveProperty('description');
  });

  it('maps a documented success to the provider-neutral result', async () => {
    mockPost.mockResolvedValue(success({ nbTracks: 1 }));

    const transfer = await new SoundiizPlaylistTransferAdapter().createTransfer(
      playlist,
    );

    expect(transfer).toEqual({
      url: SHARE_URL,
      expiresAt: new Date((NOW_SECONDS + 24 * 60 * 60) * 1000),
      trackCount: 1,
    });
    expect(loggedLines()).toContain('"event":"transfer.created"');
    expect(loggedLines()).toContain('"acceptedTrackCount":1');
    expectNoSensitiveLogs();
  });

  it.each([
    ['timeout', networkError('ECONNABORTED'), 'timeout'],
    ['network failure', networkError('ECONNREFUSED'), 'network'],
    ['upstream 5xx', httpError(502), 'upstream_error'],
    ['unexpected redirect', httpError(302), 'upstream_error'],
    ['non-HTTP failure', new Error('boom'), 'network'],
  ])('maps %s to provider unavailable', async (_label, error, category) => {
    mockPost.mockRejectedValue(error);

    await expect(
      new SoundiizPlaylistTransferAdapter().createTransfer(playlist),
    ).rejects.toMatchObject({
      code: 'TRANSFER_PROVIDER_UNAVAILABLE',
      retryAfterSeconds: 10,
    });
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(loggedLines()).toContain(`"category":"${category}"`);
    expectNoSensitiveLogs();
  });

  it('maps upstream 4xx to a rejected playlist without the upstream message', async () => {
    mockPost.mockRejectedValue(httpError(400));

    const error = await new SoundiizPlaylistTransferAdapter()
      .createTransfer(playlist)
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: 'TRANSFER_PLAYLIST_REJECTED' });
    expect((error as Error).message).not.toContain('Missing track title');
    expect(loggedLines()).toContain('"upstreamStatus":400');
    expectNoSensitiveLogs();
  });

  it('maps a success-status error body to a rejected playlist', async () => {
    mockPost.mockResolvedValue({
      data: { status: 'error', message: 'Invalid tracklist.' },
    });

    await expect(
      new SoundiizPlaylistTransferAdapter().createTransfer(playlist),
    ).rejects.toMatchObject({ code: 'TRANSFER_PLAYLIST_REJECTED' });
  });

  it.each([
    [{ 'retry-after': '120' }, 120],
    [{ 'retry-after': '100000' }, 300],
    [{ 'retry-after': 'soon' }, 30],
    [{}, 30],
  ])(
    'maps upstream 429 with %j to provider unavailable after %i seconds',
    async (headers, retryAfterSeconds) => {
      mockPost.mockRejectedValue(httpError(429, headers));

      await expect(
        new SoundiizPlaylistTransferAdapter().createTransfer(playlist),
      ).rejects.toMatchObject({
        code: 'TRANSFER_PROVIDER_UNAVAILABLE',
        retryAfterSeconds,
      });
      expect(mockPost).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['non-JSON body', '<html>oops</html>'],
    ['missing shareUrl', { status: 'success', nbTracks: 2, expiresAt: 1 }],
    ['non-integer nbTracks', success({ nbTracks: 1.5 }).data],
    ['zero nbTracks', success({ nbTracks: 0 }).data],
    ['string expiresAt', success({ expiresAt: 'tomorrow' }).data],
    ['unknown status', success({ status: 'pending' }).data],
    ['null body', null],
  ])(
    'maps a malformed response (%s) to provider unavailable',
    async (_label, data) => {
      mockPost.mockResolvedValue({ data });

      await expect(
        new SoundiizPlaylistTransferAdapter().createTransfer(playlist),
      ).rejects.toMatchObject({ code: 'TRANSFER_PROVIDER_UNAVAILABLE' });
      expect(loggedLines()).toContain('"category":"malformed_response"');
    },
  );

  it.each([
    ['more tracks than submitted', { nbTracks: 3 }],
    ['past expiry', { expiresAt: NOW_SECONDS - 1 }],
    ['current expiry', { expiresAt: NOW_SECONDS }],
    ['implausible expiry', { expiresAt: NOW_SECONDS + 49 * 60 * 60 }],
    ['http URL', { shareUrl: SHARE_URL.replace('https:', 'http:') }],
    [
      'foreign host',
      { shareUrl: SHARE_URL.replace('soundiiz.com', 'evil.example') },
    ],
  ])(
    'maps an unsafe response (%s) to provider unavailable',
    async (_label, overrides) => {
      mockPost.mockResolvedValue(success(overrides));

      await expect(
        new SoundiizPlaylistTransferAdapter().createTransfer(playlist),
      ).rejects.toMatchObject({ code: 'TRANSFER_PROVIDER_UNAVAILABLE' });
      expect(loggedLines()).toContain('"category":"unsafe_response"');
      expectNoSensitiveLogs();
    },
  );
});

describe('isSafeShareUrl', () => {
  it('accepts a canonical Soundiiz import link', () => {
    expect(isSafeShareUrl(SHARE_URL)).toBe(true);
  });

  it.each([
    SHARE_URL.replace('https:', 'http:'),
    SHARE_URL.replace('soundiiz.com', 'soundiiz.com.evil.example'),
    SHARE_URL.replace('soundiiz.com', 'evil.soundiiz.com'),
    SHARE_URL.replace('soundiiz.com', 'www.soundiiz.com'),
    SHARE_URL.replace('soundiiz.com', 'SOUNDIIZ.com'),
    SHARE_URL.replace('https://', 'https://user:pass@'),
    SHARE_URL.replace('soundiiz.com', 'soundiiz.com:8443'),
    SHARE_URL.replace('soundiiz.com', 'soundiiz.com:443'),
    `${SHARE_URL}?next=https://evil.example`,
    `${SHARE_URL}?`,
    `${SHARE_URL}#fragment`,
    'https://soundiiz.com/go/import-playlist/',
    'https://soundiiz.com/go/import-playlist/short',
    'https://soundiiz.com/logout',
    'https://soundiiz.com/go/import-playlist/0123456789abcdef/extra',
    'https://soundiiz.com/go/import-playlist/../../redirect?to=x',
    'javascript:alert(1)',
    'not a url',
    '',
  ])('rejects %s', (url) => {
    expect(isSafeShareUrl(url)).toBe(false);
  });
});

describe('sanitizeRetryAfter', () => {
  it('accepts seconds and HTTP dates within bounds', () => {
    const now = NOW.getTime();
    expect(sanitizeRetryAfter('45', now)).toBe(45);
    expect(sanitizeRetryAfter(new Date(now + 90_000).toUTCString(), now)).toBe(
      90,
    );
  });

  it('falls back or clamps unsafe values', () => {
    const now = NOW.getTime();
    expect(sanitizeRetryAfter('0', now)).toBe(30);
    expect(sanitizeRetryAfter('-5', now)).toBe(30);
    expect(sanitizeRetryAfter('1e9', now)).toBe(30);
    expect(sanitizeRetryAfter(new Date(now - 1).toUTCString(), now)).toBe(30);
    expect(sanitizeRetryAfter('999999', now)).toBe(300);
    expect(sanitizeRetryAfter(undefined, now)).toBe(30);
    expect(sanitizeRetryAfter(['10'], now)).toBe(30);
  });
});
