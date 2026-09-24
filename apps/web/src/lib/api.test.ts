import { afterEach, describe, expect, it } from 'vitest'
import {
  ApiError,
  api,
  getApiErrorMessage,
  isRequestLimited,
  isSpotifyRateLimited,
} from '@/lib/api'
import type { CreateDiscoverRequest, CreateMixRequest } from '@/lib/api'
import type { MessageKey } from '@/i18n/messages'

const t = (key: MessageKey, vars?: Record<string, string | number>) => {
  if (!vars) return key
  return `${key}:${Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join(',')}`
}

afterEach(() => vi.unstubAllGlobals())

function stubSuccessfulFetch() {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ id: 'playlist-1' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('isSpotifyRateLimited', () => {
  it('detects HTTP 429', () => {
    expect(isSpotifyRateLimited(new ApiError('wait', 429))).toBe(true)
  })

  it('detects SPOTIFY_RATE_LIMITED code', () => {
    expect(
      isSpotifyRateLimited(
        new ApiError('quota', 503, {
          statusCode: 503,
          code: 'SPOTIFY_RATE_LIMITED',
          message: 'quota',
        }),
      ),
    ).toBe(true)
  })

  it('detects SPOTIFY_QUOTA_EXCEEDED code', () => {
    expect(
      isSpotifyRateLimited(
        new ApiError('quota', 429, {
          statusCode: 429,
          code: 'SPOTIFY_QUOTA_EXCEEDED',
          message: 'quota',
        }),
      ),
    ).toBe(true)
  })

  it('ignores unrelated errors', () => {
    expect(isSpotifyRateLimited(new ApiError('nope', 500))).toBe(false)
    expect(isSpotifyRateLimited(new Error('x'))).toBe(false)
  })
})

function requestLimitError(code: string, statusCode: number, retryAfterSeconds = 30) {
  return new ApiError('limited', statusCode, {
    statusCode,
    code,
    message: 'limited',
    details: { retryAfterSeconds },
  })
}

describe('request limit errors', () => {
  it('are not treated as Spotify rate limits', () => {
    const error = requestLimitError('RATE_LIMITED', 429)
    expect(isRequestLimited(error)).toBe(true)
    expect(isSpotifyRateLimited(error)).toBe(false)
  })

  it('ignores unrelated and inherited codes', () => {
    expect(isRequestLimited(requestLimitError('SPOTIFY_RATE_LIMITED', 429))).toBe(false)
    expect(isRequestLimited(requestLimitError('constructor', 429))).toBe(false)
    expect(isRequestLimited(new Error('x'))).toBe(false)
  })

  it.each([
    ['RATE_LIMITED', 429, 'errors.rateLimited:wait=errors.wait.seconds:n=30'],
    ['CAPACITY_EXCEEDED', 503, 'errors.capacityExceeded:wait=errors.wait.seconds:n=30'],
    ['SERVICE_UNAVAILABLE', 503, 'errors.serviceUnavailable:wait=errors.wait.seconds:n=30'],
    ['CONCURRENCY_LIMITED', 429, 'errors.concurrencyLimited'],
  ])('localizes %s', (code, status, expected) => {
    expect(getApiErrorMessage(requestLimitError(code, status), t)).toBe(expected)
  })
})

describe('getApiErrorMessage', () => {
  it('localizes quota exceeded with wait label', () => {
    const message = getApiErrorMessage(
      new ApiError('en message', 429, {
        statusCode: 429,
        code: 'SPOTIFY_QUOTA_EXCEEDED',
        message: 'en message',
        details: { retryAfterSeconds: 10800 },
      }),
      t,
    )
    expect(message).toBe('errors.spotifyQuota:wait=errors.wait.hours:n=3')
  })

  it('localizes rate limit without relying on API message', () => {
    const message = getApiErrorMessage(
      new ApiError('Spotify rate limit. Wait about 20 seconds…', 429, {
        statusCode: 429,
        code: 'SPOTIFY_RATE_LIMITED',
        message: 'Spotify rate limit.',
        details: { retryAfterSeconds: 20 },
      }),
      t,
      'create.failed',
    )
    expect(message).toBe('errors.spotifyRateLimit:wait=errors.wait.seconds:n=20')
  })

  it('falls back for unknown errors', () => {
    expect(getApiErrorMessage(new Error('x'), t, 'create.failed')).toBe(
      'create.failed',
    )
  })

  it.each([
    ['PREMIUM_REQUIRED', 'preview.premiumRequired'],
    ['PLAYBACK_UNAUTHORIZED', 'preview.sessionExpired'],
    ['PLAYBACK_INVALID', 'preview.invalidPlayback'],
    ['PLAYBACK_FAILED', 'preview.playError'],
  ])('localizes playback code %s', (code, expected) => {
    expect(
      getApiErrorMessage(
        new ApiError('raw server message', 400, {
          statusCode: 400,
          code,
          message: 'raw server message',
        }),
        t,
        'preview.playError',
      ),
    ).toBe(expected)
  })
})

describe('playlist request contracts', () => {
  it('sends the canonical artist mix payload', async () => {
    const fetchMock = stubSuccessfulFetch()

    await api.createMix({
      kind: 'artist_mix',
      artistIds: ['artist-1'],
      tracksPerSeed: 10,
      popularity: 'balanced',
      orderMode: 'random',
      persistToLibrary: true,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/playlists/mix'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Accept: 'application/x-ndjson',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          kind: 'artist_mix',
          artistIds: ['artist-1'],
          tracksPerSeed: 10,
          popularity: 'balanced',
          orderMode: 'random',
          persistToLibrary: true,
        }),
      }),
    )
  })

  it('sends the canonical genre mix payload', async () => {
    const fetchMock = stubSuccessfulFetch()
    const payload: CreateMixRequest = {
      kind: 'genre_mix',
      genreIds: ['jazz'],
      tracksPerSeed: 12,
      popularity: 'popular',
      orderMode: 'artist',
      persistToLibrary: false,
    }

    await api.createMix(payload)

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/playlists/mix'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    )
  })

  it.each([
    {
      label: 'artist',
      payload: {
        kind: 'discover_artist',
        artistId: 'artist-1',
        targetTrackCount: 30,
        popularity: 'rarities',
        orderMode: 'random',
        persistToLibrary: true,
      } satisfies CreateDiscoverRequest,
    },
    {
      label: 'track',
      payload: {
        kind: 'discover_track',
        trackId: 'track-1',
        track: {
          id: 'track-1',
          name: 'Smooth Operator',
          artistId: 'artist-1',
          artistName: 'Sade',
        },
        targetTrackCount: 15,
        popularity: 'balanced',
        orderMode: 'random',
        persistToLibrary: true,
      } satisfies CreateDiscoverRequest,
    },
  ])('sends the canonical Discover $label payload', async ({ payload }) => {
    const fetchMock = stubSuccessfulFetch()

    await api.createDiscover(payload)

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/playlists/discover'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Accept: 'application/x-ndjson',
        }),
        body: JSON.stringify(payload),
      }),
    )
  })

  it('reads NDJSON progress and result for mix creation', async () => {
    const playlist = {
      id: 'playlist-1',
      name: 'Mix',
      description: '',
      kind: 'artist_mix',
      seeds: [{ type: 'artist', id: 'a1', name: 'Sade' }],
      seedCount: 1,
      trackCount: 1,
      totalDurationMs: 1000,
      spotifyUrl: null,
      status: 'COMPLETED',
      missingOnSpotify: false,
      imageUrl: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      tracks: [],
      generation: {
        version: 1,
        kind: 'artist_mix',
        tracksPerSeed: 1,
        seeds: [{ id: 'a1', name: 'Sade' }],
        popularity: 'balanced',
        orderMode: 'random',
      },
    }
    const body = [
      JSON.stringify({
        type: 'progress',
        phase: 'publishing',
        current: 1,
        total: 3,
        percent: 93,
      }),
      JSON.stringify({ type: 'result', playlist }),
      '',
    ].join('\n')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const percents: number[] = []
    const result = await api.createMix(
      {
        kind: 'artist_mix',
        artistIds: ['artist-1'],
        tracksPerSeed: 1,
        popularity: 'balanced',
        orderMode: 'random',
        persistToLibrary: true,
      },
      { onProgress: (progress) => percents.push(progress.percent) },
    )

    expect(percents).toEqual([93])
    expect(result.id).toBe('playlist-1')
  })
})
