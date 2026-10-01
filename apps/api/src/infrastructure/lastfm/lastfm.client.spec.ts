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

  beforeEach(() => {
    get.mockReset();
    setJson.mockClear();
  });

  function requestParams(call = 0): Record<string, unknown> {
    const [, config] = get.mock.calls[call] as [
      string,
      { params: Record<string, unknown> },
    ];
    return config.params;
  }

  function cachedKeys(): string[] {
    return setJson.mock.calls.map(([key]) => key as string);
  }

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

  it('caches weighted artist tags under the artist name when no MBID is known', async () => {
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

    const tags = await client().getTopTagsForArtist({
      name: ' Charly García ',
    });

    expect(requestParams()).toMatchObject({
      method: 'artist.getTopTags',
      autocorrect: 1,
    });
    expect(requestParams()).not.toHaveProperty('mbid');
    expect(tags).toEqual([
      { name: 'Rock', count: 53 },
      { name: 'argentina', count: 82 },
    ]);
    expect(setJson).toHaveBeenCalledWith(
      'blendify:lastfm:artist-tags:name:charly garcía',
      tags,
      expect.any(Number),
    );
  });

  it('serves artist tags from the cache without a request', async () => {
    getJson.mockResolvedValueOnce([{ name: 'rock', count: 100 }]);

    await expect(
      client().getTopTagsForArtist({ name: 'Soda Stereo' }),
    ).resolves.toEqual([{ name: 'rock', count: 100 }]);
    expect(get).not.toHaveBeenCalled();
  });

  it('treats an unknown artist as having no tags', async () => {
    get.mockResolvedValue({ data: { error: 6, message: 'not found' } });

    await expect(
      client().getTopTagsForArtist({ name: 'Nobody', mbid: 'mbid-unknown' }),
    ).resolves.toEqual([]);
  });

  it('caches an unknown artist chart briefly as empty', async () => {
    get.mockResolvedValue({ data: { error: 6, message: 'not found' } });

    await expect(
      client().getTopTracksForArtist({ name: 'Nobody' }, 50),
    ).resolves.toEqual([]);
    expect(setJson).toHaveBeenCalledWith(
      'blendify:lastfm:artist-tracks:name:nobody|50',
      [],
      30 * 60 * 1000,
    );
  });

  it('still raises other artist chart errors', async () => {
    get.mockResolvedValue({ data: { error: 29, message: 'rate limit' } });

    await expect(
      client().getTopTracksForArtist({ name: 'Nobody' }),
    ).rejects.toThrow('Last.fm error 29');
  });

  it('looks up artist tags by MBID when Last.fm provided one', async () => {
    get.mockResolvedValue({ data: { toptags: { tag: [] } } });

    await client().getTopTagsForArtist({
      name: 'Sui Generis',
      mbid: ' MBID-Argentine-Band ',
    });

    expect(requestParams()).toMatchObject({
      method: 'artist.getTopTags',
      mbid: 'MBID-Argentine-Band',
    });
    expect(requestParams()).not.toHaveProperty('artist');
    expect(requestParams()).not.toHaveProperty('autocorrect');
    expect(cachedKeys()).toEqual([
      'blendify:lastfm:artist-tags:mbid:mbid-argentine-band',
    ]);
  });

  it('looks up an artist chart by MBID and falls back to the name without one', async () => {
    get.mockResolvedValue({
      data: { toptracks: { track: [{ name: 'Botas Locas' }] } },
    });

    const tracks = await client().getTopTracksForArtist(
      { name: 'Sui Generis', mbid: 'mbid-argentine-band' },
      50,
    );
    await client().getTopTracksForArtist({ name: 'Sui Generis' }, 50);

    expect(requestParams(0)).toMatchObject({
      method: 'artist.getTopTracks',
      mbid: 'mbid-argentine-band',
      limit: 50,
    });
    expect(requestParams(0)).not.toHaveProperty('artist');
    expect(requestParams(1)).toMatchObject({
      method: 'artist.getTopTracks',
      artist: 'Sui Generis',
      autocorrect: 1,
    });
    expect(requestParams(1)).not.toHaveProperty('mbid');
    expect(tracks).toEqual([
      { artistName: 'Sui Generis', trackName: 'Botas Locas', rank: 1 },
    ]);
  });

  it('keeps homonymous artists with different MBIDs in separate cache entries', async () => {
    get.mockResolvedValue({ data: { toptags: { tag: [] } } });
    const lastFm = client();
    const argentine = { name: 'Sui Generis', mbid: 'mbid-argentine-band' };
    const homonym = { name: 'Sui Generis', mbid: 'mbid-other-artist' };

    await lastFm.getTopTagsForArtist(argentine);
    await lastFm.getTopTagsForArtist(homonym);
    await lastFm.getTopTagsForArtist({ name: 'Sui Generis' });
    await lastFm.getTopTracksForArtist(argentine, 50);
    await lastFm.getTopTracksForArtist(homonym, 50);
    await lastFm.getTopTracksForArtist({ name: 'Sui Generis' }, 50);

    expect(get.mock.calls.map((_, call) => requestParams(call).mbid)).toEqual([
      'mbid-argentine-band',
      'mbid-other-artist',
      undefined,
      'mbid-argentine-band',
      'mbid-other-artist',
      undefined,
    ]);
    expect(cachedKeys()).toEqual([
      'blendify:lastfm:artist-tags:mbid:mbid-argentine-band',
      'blendify:lastfm:artist-tags:mbid:mbid-other-artist',
      'blendify:lastfm:artist-tags:name:sui generis',
      'blendify:lastfm:artist-tracks:mbid:mbid-argentine-band|50',
      'blendify:lastfm:artist-tracks:mbid:mbid-other-artist|50',
      'blendify:lastfm:artist-tracks:name:sui generis|50',
    ]);
  });
});
