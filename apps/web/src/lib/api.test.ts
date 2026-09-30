import { afterEach, describe, expect, it } from 'vitest'
import {
  ApiError,
  api,
  getApiErrorMessage,
  isRequestLimited,
  isSpotifyRateLimited,
} from '@/lib/api'
import type {
  CreateDiscoverRequest,
  CreateMixRequest,
  GeneratedPlaylistDto,
  PlaylistDetail,
} from '@/lib/api'
import type { MessageKey } from '@/i18n/messages'

const t = (key: MessageKey, vars?: Record<string, string | number>) => {
  if (!vars) {
    return key
  }
  return `${key}:${Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join(',')}`
}

afterEach(() => vi.unstubAllGlobals())

const generation: PlaylistDetail['generation'] = {
  version: 1,
  kind: 'artist_mix',
  tracksPerSeed: 1,
  seeds: [{ id: 'a1', name: 'Sade' }],
  popularity: 'balanced',
  orderMode: 'random',
}

const spotifyPlaylist = {
  id: 'playlist-1',
  name: 'Mix',
  description: '',
  kind: 'artist_mix',
  seeds: [{ type: 'artist', id: 'a1', name: 'Sade' }],
  seedCount: 1,
  trackCount: 0,
  totalDurationMs: 0,
  spotifyUrl: null,
  status: 'COMPLETED',
  imageUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  tracks: [],
  generation,
} satisfies PlaylistDetail

const guestPlaylist = {
  name: 'Mix',
  description: '',
  generation,
  seeds: [{ type: 'artist', id: 'a1', name: 'Sade' }],
  tracks: [],
  transfer: null,
} satisfies GeneratedPlaylistDto

function jsonResponse(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function stubSuccessfulFetch(body: unknown = spotifyPlaylist) {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>): unknown {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
  return JSON.parse(String(init?.body))
}

describe('isSpotifyRateLimited', () => {
  it('does not classify a bare HTTP 429 as a Spotify limit', () => {
    expect(isSpotifyRateLimited(new ApiError('wait', 429))).toBe(false)
    expect(
      isSpotifyRateLimited(
        new ApiError('wait', 429, { statusCode: 429, code: 'SOMETHING_ELSE', message: 'wait' }),
      ),
    ).toBe(false)
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

  it.each([
    ['RATE_LIMITED', 429, 'errors.rateLimitedLater'],
    ['CAPACITY_EXCEEDED', 503, 'errors.capacityExceededLater'],
    ['SERVICE_UNAVAILABLE', 503, 'errors.serviceUnavailableLater'],
  ])('does not invent a wait for %s without one', (code, status, expected) => {
    const error = new ApiError('limited', status, { statusCode: status, code, message: 'limited' })
    expect(getApiErrorMessage(error, t)).toBe(expected)
  })
})

describe('getApiErrorMessage', () => {
  function spotifyLimitError(code: string, details?: object) {
    return new ApiError('provider text', 429, {
      statusCode: 429,
      code,
      message: 'provider text',
      ...(details ? { details } : {}),
    })
  }

  it.each(['SPOTIFY_RATE_LIMITED', 'SPOTIFY_QUOTA_EXCEEDED'])(
    'attributes the wait to Spotify for %s when Spotify provided it',
    (code) => {
      const error = spotifyLimitError(code, { retryAfterSeconds: 10800, retryAfterSource: 'spotify' })
      expect(getApiErrorMessage(error, t, 'create.failed')).toBe(
        'errors.spotifyLimit.spotifyWait:wait=errors.wait.hours:n=3',
      )
    },
  )

  it('labels a Blendify cooldown as an estimate, not a Spotify wait', () => {
    const error = spotifyLimitError('SPOTIFY_RATE_LIMITED', {
      retryAfterSeconds: 20,
      retryAfterSource: 'blendify',
    })
    expect(getApiErrorMessage(error, t, 'create.failed')).toBe(
      'errors.spotifyLimit.estimate:wait=errors.wait.seconds:n=20',
    )
  })

  it.each([
    ['no details', undefined],
    ['null wait', { retryAfterSeconds: null, retryAfterSource: null }],
    ['zero wait', { retryAfterSeconds: 0, retryAfterSource: 'spotify' }],
    ['a wait without a source', { retryAfterSeconds: 45 }],
    ['an unknown source', { retryAfterSeconds: 45, retryAfterSource: 'proxy' }],
  ])('does not show a wait for %s', (_label, details) => {
    const error = spotifyLimitError('SPOTIFY_QUOTA_EXCEEDED', details)
    expect(getApiErrorMessage(error, t, 'create.failed')).toBe('errors.spotifyLimit.unknown')
  })

  it('does not treat a bare 429 as a Spotify limit', () => {
    const error = new ApiError('x', 429, { statusCode: 429, code: 'UPSTREAM', message: 'x' })
    expect(getApiErrorMessage(error, t, 'create.failed')).toBe('create.failed')
  })

  it('falls back for unknown errors', () => {
    expect(getApiErrorMessage(new Error('x'), t, 'create.failed')).toBe(
      'create.failed',
    )
  })

  it.each([
    ['SPOTIFY_UNAVAILABLE', 503, 'errors.spotifyUnavailable'],
    ['SPOTIFY_PERMISSION_DENIED', 403, 'errors.spotifyPermissionDenied'],
    ['SPOTIFY_REQUEST_REJECTED', 502, 'errors.spotifyRequestRejected'],
    ['SPOTIFY_OUTCOME_UNKNOWN', 502, 'errors.spotifyOutcomeUnknown'],
    ['SPOTIFY_PLAYLIST_INCOMPLETE', 502, 'errors.spotifyPlaylistIncomplete'],
  ])('localizes Spotify provider failure %s without blaming the chosen song', (code, status, expected) => {
    const message = getApiErrorMessage(
      new ApiError('raw server message', status, {
        statusCode: status,
        code,
        message: 'raw server message',
      }),
      t,
      'discover.failed',
    )
    expect(message).toBe(expected)
    expect(message).not.toBe('discover.resolveFailed')
  })

  it.each([
    ['SPOTIFY_UNAVAILABLE', { retryAfterSeconds: 30, retryAfterSource: 'spotify' }, 'errors.spotifyUnavailableWait'],
    ['CATALOG_UNAVAILABLE', { retryAfterSeconds: 30, retryAfterSource: 'spotify' }, 'errors.spotifyUnavailableWait'],
    ['SPOTIFY_UNAVAILABLE', { operation: 'searchArtists' }, 'errors.spotifyUnavailable'],
  ])('states the wait only when Spotify itself asked for it on %s', (code, details, expected) => {
    const message = getApiErrorMessage(
      new ApiError('raw server message', 503, {
        statusCode: 503,
        code,
        message: 'raw server message',
        details,
      }),
      t,
      'discover.failed',
    )
    expect(message.split(':')[0]).toBe(expected)
  })

  it('keeps a missing seed song an input problem', () => {
    expect(
      getApiErrorMessage(
        new ApiError('Seed track could not be resolved', 422, {
          statusCode: 422,
          code: 'TRACK_RESOLVE_FAILED',
          message: 'Seed track could not be resolved',
          details: { name: 'Un Beso en la Nariz' },
        }),
        t,
        'discover.failed',
      ),
    ).toBe('errors.trackResolveNamed:name=Un Beso en la Nariz')
  })

  it.each([
    ['PREMIUM_REQUIRED', 'preview.premiumRequired'],
    ['PLAYBACK_UNAUTHORIZED', 'preview.sessionExpired'],
    ['PLAYBACK_INVALID', 'preview.invalidPlayback'],
    ['PLAYBACK_FAILED', 'preview.playError'],
    ['SPOTIFY_REAUTH_REQUIRED', 'errors.spotifyReauthRequired'],
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

describe('Guest generation contracts', () => {
  it('sends Guest mix requests to the public generation endpoint', async () => {
    const fetchMock = stubSuccessfulFetch(guestPlaylist)

    const result = await api.generateMix({
      kind: 'artist_mix',
      artistIds: ['artist-1'],
      tracksPerSeed: 10,
      popularity: 'balanced',
      orderMode: 'random',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/generate/mix'),
      expect.objectContaining({ method: 'POST' }),
    )
    expect(result).toEqual(guestPlaylist)
  })

  it('sends Guest discover requests to the public generation endpoint', async () => {
    const fetchMock = stubSuccessfulFetch(guestPlaylist)

    await api.generateDiscover({
      kind: 'discover_artist',
      artistId: 'artist-1',
      targetTrackCount: 30,
      popularity: 'balanced',
      orderMode: 'random',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/generate/discover'),
      expect.anything(),
    )
  })

  it('reads Guest NDJSON progress and the generated playlist', async () => {
    const body = [
      JSON.stringify({
        type: 'progress',
        phase: 'matching_tracks',
        current: 1,
        total: 2,
        percent: 60,
      }),
      JSON.stringify({ type: 'result', playlist: guestPlaylist }),
      '',
    ].join('\n')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'application/x-ndjson' },
        }),
      ),
    )

    const percents: number[] = []
    const result = await api.generateMix(
      {
        kind: 'genre_mix',
        genreIds: ['jazz'],
        tracksPerSeed: 5,
        popularity: 'balanced',
        orderMode: 'random',
      },
      { onProgress: (progress) => percents.push(progress.percent) },
    )

    expect(percents).toEqual([60])
    expect(result.transfer).toBeNull()
  })

  it('rejects a JSON response that does not match the Guest contract', async () => {
    stubSuccessfulFetch(spotifyPlaylist)

    await expect(
      api.generateMix({
        kind: 'genre_mix',
        genreIds: ['jazz'],
        tracksPerSeed: 5,
        popularity: 'balanced',
        orderMode: 'random',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_GENERATION_RESPONSE' })
  })

  it('rejects a JSON response that does not match the Spotify contract', async () => {
    stubSuccessfulFetch(guestPlaylist)

    await expect(
      api.createMix({
        kind: 'genre_mix',
        genreIds: ['jazz'],
        tracksPerSeed: 5,
        popularity: 'balanced',
        orderMode: 'random',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_GENERATION_RESPONSE' })
  })
})

describe('createTransfer', () => {
  it('sends only the transfer token and validates the response', async () => {
    const fetchMock = stubSuccessfulFetch({
      url: 'https://soundiiz.com/go/import-playlist/abcdefghijklmnop',
      expiresAt: '2026-09-26T12:00:00.000Z',
      trackCount: 12,
    })

    const transfer = await api.createTransfer('signed-token')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/transfers'),
      expect.objectContaining({ method: 'POST' }),
    )
    expect(sentBody(fetchMock)).toEqual({ transferToken: 'signed-token' })
    expect(transfer.trackCount).toBe(12)
  })

  it('rejects an invalid transfer response', async () => {
    stubSuccessfulFetch({ url: 'not a url' })

    await expect(api.createTransfer('signed-token')).rejects.toBeInstanceOf(
      ApiError,
    )
  })
})

describe('M8/M9 error messages', () => {
  function apiError(status: number, code: string, details?: object) {
    return new ApiError(code, status, {
      statusCode: status,
      code,
      message: 'internal provider detail',
      details,
    })
  }

  it.each([
    ['CATALOG_UNAVAILABLE', 503, 'errors.catalogUnavailable'],
    ['INVALID_GENERATION_RESPONSE', 502, 'errors.invalidGenerationResponse'],
    ['TRANSFER_TOKEN_INVALID', 400, 'transfer.errorInvalid'],
    ['TRANSFER_TOKEN_EXPIRED', 410, 'transfer.errorExpired'],
    ['TRANSFER_PLAYLIST_REJECTED', 422, 'transfer.errorRejected'],
  ])('maps %s without exposing the server message', (code, status, key) => {
    expect(getApiErrorMessage(apiError(status, code), t)).toBe(key)
  })

  it('maps an unavailable transfer provider with its retry wait', () => {
    expect(
      getApiErrorMessage(
        apiError(503, 'TRANSFER_PROVIDER_UNAVAILABLE', { retryAfterSeconds: 10 }),
        t,
      ),
    ).toBe('transfer.errorUnavailable:wait=errors.wait.seconds:n=10')
  })
})
