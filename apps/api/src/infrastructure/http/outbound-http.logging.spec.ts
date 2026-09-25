import { Logger } from '@nestjs/common';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import {
  buildOutboundHttpLog,
  createOutboundHttp,
  parseOutboundRequestBody,
  resolveOutboundUrl,
  sanitizeOutboundUrl,
  summarizeOutboundPayload,
} from './outbound-http.logging';

describe('outbound http logging', () => {
  it('redacts sensitive query params', () => {
    expect(
      sanitizeOutboundUrl(
        'https://ws.audioscrobbler.com/2.0/?method=artist.getSimilar&api_key=secret&artist=Cher',
      ),
    ).toBe(
      'https://ws.audioscrobbler.com/2.0/?method=artist.getSimilar&api_key=***&artist=Cher',
    );
  });

  it('builds absolute url from baseURL + params', () => {
    const url = resolveOutboundUrl({
      baseURL: 'https://api.spotify.com/v1',
      url: '/search',
      method: 'get',
      params: { q: 'sade', type: 'artist', limit: 5 },
      headers: {},
    } as never);

    expect(url).toContain('https://api.spotify.com/v1/search?');
    expect(url).toContain('q=sade');
    expect(url).toContain('type=artist');
  });

  it('builds a JSON-friendly outbound log payload', () => {
    const payload = buildOutboundHttpLog({
      method: 'GET',
      url: 'https://api.spotify.com/v1/me',
      status: 200,
      durationMs: 42,
      response: { id: 'u1', access_token: 'secret' },
    });

    expect(payload).toEqual({
      type: 'outbound_http',
      method: 'GET',
      url: 'https://api.spotify.com/v1/me',
      status: 200,
      durationMs: 42,
      response: { id: 'u1', access_token: '***' },
    });
  });

  it('includes redacted request body for POST/PUT logs', () => {
    const payload = buildOutboundHttpLog({
      method: 'POST',
      url: 'https://api.spotify.com/v1/playlists/x/items',
      status: 201,
      durationMs: 40,
      request: {
        uris: ['spotify:track:1', 'spotify:track:2'],
        access_token: 'secret',
        code: 'oauth-code',
      },
      response: { snapshot_id: 'snap' },
    });

    expect(payload.request).toEqual({
      uris: ['spotify:track:1', 'spotify:track:2'],
      access_token: '***',
      code: '***',
    });
    expect(payload.response).toEqual({ snapshot_id: 'snap' });
  });

  it('parses form bodies and omits base64 blobs', () => {
    expect(
      parseOutboundRequestBody('grant_type=refresh_token&refresh_token=abc'),
    ).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'abc',
    });

    const blob = 'A'.repeat(500);
    expect(parseOutboundRequestBody(blob)).toEqual({
      _type: 'base64',
      chars: 500,
      note: 'binary/base64 body omitted',
    });
  });

  it('summarizes oversized payloads with a JSON object preview', () => {
    const big = {
      items: Array.from({ length: 200 }, (_, i) => ({
        i,
        name: 'x'.repeat(80),
      })),
    };
    const summary = summarizeOutboundPayload(big) as {
      truncated?: boolean;
      chars?: number;
      preview?: { items?: unknown[] };
    };
    expect(summary.truncated).toBe(true);
    expect(typeof summary.chars).toBe('number');
    expect(summary.preview).toEqual(expect.any(Object));
    expect(Array.isArray(summary.preview?.items)).toBe(true);
    expect(
      summary.preview?.items?.some(
        (item) =>
          typeof item === 'object' && item != null && '_omitted' in item,
      ),
    ).toBe(true);
  });
});

describe('outbound http body logging', () => {
  const adapter: AxiosAdapter = (config: InternalAxiosRequestConfig) =>
    Promise.resolve({
      data: { shareUrl: 'https://soundiiz.com/go/import-playlist/secret-link' },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });

  afterEach(() => jest.restoreAllMocks());

  async function logLine(options?: { logBodies?: boolean }): Promise<string> {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    await createOutboundHttp({ adapter }, options).post(
      'https://soundiiz.com/go/import-playlist',
      { tracklist: [{ title: 'Private Track Title' }] },
    );
    return String(log.mock.calls[0][0]);
  }

  it('keeps logging request and response bodies by default', async () => {
    const line = await logLine();

    expect(line).toContain('Private Track Title');
    expect(line).toContain('secret-link');
  });

  it('omits bodies when disabled but keeps request metadata', async () => {
    const line = JSON.parse(await logLine({ logBodies: false })) as Record<
      string,
      unknown
    >;

    expect(line).toEqual({
      type: 'outbound_http',
      method: 'POST',
      url: 'https://soundiiz.com/go/import-playlist',
      status: 200,
      durationMs: expect.any(Number) as number,
    });
  });
});
