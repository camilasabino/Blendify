import { Logger } from '@nestjs/common';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import type { SpotifyTokenService } from '../auth/spotify-token.service';
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
