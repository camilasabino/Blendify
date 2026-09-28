import { Logger } from '@nestjs/common';
import {
  AxiosError,
  type AxiosAdapter,
  type InternalAxiosRequestConfig,
} from 'axios';
import { ProviderOutcomeUnknownError } from '@/domain/errors/provider-outcome-unknown.error';
import type { SpotifyTokenService } from '@/infrastructure/auth/spotify-token.service';
import { SpotifyApiClient } from './spotify-api.client';

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

  async function logLine(options?: { logBodies?: boolean }): Promise<string> {
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
    const line = await logLine({ logBodies: false });

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
  });
});

describe('SpotifyApiClient errors', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  const client = () => new SpotifyApiClient({} as SpotifyTokenService);

  it('marks a request without any response as having an unknown outcome', () => {
    for (const code of ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET']) {
      const error = client().toSpotifyError(
        'createPlaylist',
        new AxiosError('timeout', code),
      );

      expect(error).toBeInstanceOf(ProviderOutcomeUnknownError);
      expect(error.message).toBe(
        'Spotify createPlaylist failed (undefined): timeout',
      );
    }
  });

  it('keeps plain errors for requests that never left or got a response', () => {
    const notSent = client().toSpotifyError(
      'createPlaylist',
      new AxiosError('refused', 'ECONNREFUSED'),
    );
    const answered = client().toSpotifyError(
      'createPlaylist',
      new AxiosError('boom', 'ERR_BAD_RESPONSE', undefined, undefined, {
        status: 500,
        statusText: 'Server Error',
        headers: {},
        config: { headers: {} } as InternalAxiosRequestConfig,
        data: {},
      }),
    );

    expect(notSent).not.toBeInstanceOf(ProviderOutcomeUnknownError);
    expect(answered).not.toBeInstanceOf(ProviderOutcomeUnknownError);
    expect(answered.message).toBe('Spotify createPlaylist failed (500): boom');
  });
});
