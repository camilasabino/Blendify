import { ConfigService } from '@nestjs/config';
import type { RedisCacheService } from '@/infrastructure/cache/redis-cache.service';
import { LastFmClient } from './lastfm.client';

const mockCreateOutboundHttp = jest.fn((..._args: unknown[]) => ({}));

jest.mock('@/infrastructure/http/outbound-http.logging', () => ({
  createOutboundHttp: (...args: unknown[]) => mockCreateOutboundHttp(...args),
}));

function create(env: Record<string, string>): void {
  new LastFmClient(new ConfigService(env), {} as RedisCacheService);
}

describe('LastFmClient outbound logging', () => {
  beforeEach(() => mockCreateOutboundHttp.mockClear());

  it('does not log response bodies in production', () => {
    create({ NODE_ENV: 'production' });

    expect(mockCreateOutboundHttp.mock.calls[0][1]).toEqual({
      logContent: false,
    });
  });

  it('keeps response bodies outside production', () => {
    create({ NODE_ENV: 'development' });

    expect(mockCreateOutboundHttp.mock.calls[0][1]).toEqual({
      logContent: true,
    });
  });
});

describe('LastFmClient tag discovery', () => {
  const get = jest.fn();
  const getJson = jest.fn((): Promise<unknown> => Promise.resolve(null));
  const setJson = jest.fn((..._args: unknown[]) => Promise.resolve());
  const cache = { getJson, setJson } as unknown as RedisCacheService;

  function client(): LastFmClient {
    mockCreateOutboundHttp.mockReturnValueOnce({ get });
    return new LastFmClient(
      new ConfigService({ LASTFM_API_KEY: 'test-key' }),
      cache,
    );
  }

  beforeEach(() => get.mockReset());

  it('requests one page of a canonical tag as written', async () => {
    get.mockResolvedValue({
      data: { topartists: { artist: [{ name: 'Soda Stereo', mbid: 'm-1' }] } },
    });

    const artists = await client().getTopArtistsForTag('Argentina', 50, 3);

    const [, config] = get.mock.calls[0] as [
      string,
      { params: Record<string, unknown> },
    ];
    expect(config.params).toMatchObject({
      method: 'tag.getTopArtists',
      tag: 'argentina',
      limit: 50,
      page: 3,
    });
    expect(artists).toEqual([{ name: 'Soda Stereo', mbid: 'm-1' }]);
  });

  it('caches weighted artist tags under the artist name', async () => {
    get.mockResolvedValue({
      data: {
        toptags: {
          tag: [
            { name: 'Rock', count: 53 },
            { name: 'argentina', count: '82' },
          ],
        },
      },
    });

    const tags = await client().getTopTagsForArtist(' Charly García ');

    const [, config] = get.mock.calls[0] as [
      string,
      { params: Record<string, unknown> },
    ];
    expect(config.params).toMatchObject({
      method: 'artist.getTopTags',
      autocorrect: 1,
    });
    expect(tags).toEqual([
      { name: 'Rock', count: 53 },
      { name: 'argentina', count: 82 },
    ]);
    expect(setJson).toHaveBeenCalledWith(
      'blendify:lastfm:artist-tags:charly garcía',
      tags,
      expect.any(Number),
    );
  });

  it('serves artist tags from the cache without a request', async () => {
    getJson.mockResolvedValueOnce([{ name: 'rock', count: 100 }]);

    await expect(client().getTopTagsForArtist('Soda Stereo')).resolves.toEqual([
      { name: 'rock', count: 100 },
    ]);
    expect(get).not.toHaveBeenCalled();
  });

  it('treats an unknown artist as having no tags', async () => {
    get.mockResolvedValue({ data: { error: 6, message: 'not found' } });

    await expect(client().getTopTagsForArtist('Nobody')).resolves.toEqual([]);
  });

  it('caches an unknown artist chart briefly as empty', async () => {
    get.mockResolvedValue({ data: { error: 6, message: 'not found' } });
    setJson.mockClear();

    await expect(client().getTopTracksForArtist('Nobody', 50)).resolves.toEqual(
      [],
    );
    expect(setJson).toHaveBeenCalledWith(
      'blendify:lastfm:artist-tracks:nobody|50',
      [],
      30 * 60 * 1000,
    );
  });

  it('still raises other artist chart errors', async () => {
    get.mockResolvedValue({ data: { error: 29, message: 'rate limit' } });

    await expect(client().getTopTracksForArtist('Nobody')).rejects.toThrow(
      'Last.fm error 29',
    );
  });
});
