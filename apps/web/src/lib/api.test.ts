import { describe, expect, it } from 'vitest'
import { ApiError, getApiErrorMessage, isSpotifyRateLimited } from '@/lib/api'
import type { MessageKey } from '@/i18n/messages'

const t = (key: MessageKey, vars?: Record<string, string | number>) => {
  if (!vars) return key
  return `${key}:${Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join(',')}`
}

describe('isSpotifyRateLimited', () => {
  it('detects HTTP 429', () => {
    expect(isSpotifyRateLimited(new ApiError('wait', 429))).toBe(true)
  })

  it('detects SPOTIFY_RATE_LIMITED code', () => {
    expect(
      isSpotifyRateLimited(
        new ApiError('quota', 503, { code: 'SPOTIFY_RATE_LIMITED' }),
      ),
    ).toBe(true)
  })

  it('detects SPOTIFY_QUOTA_EXCEEDED code', () => {
    expect(
      isSpotifyRateLimited(
        new ApiError('quota', 429, { code: 'SPOTIFY_QUOTA_EXCEEDED' }),
      ),
    ).toBe(true)
  })

  it('ignores unrelated errors', () => {
    expect(isSpotifyRateLimited(new ApiError('nope', 500))).toBe(false)
    expect(isSpotifyRateLimited(new Error('x'))).toBe(false)
  })
})

describe('getApiErrorMessage', () => {
  it('localizes quota exceeded with wait label', () => {
    const message = getApiErrorMessage(
      new ApiError('en message', 429, {
        code: 'SPOTIFY_QUOTA_EXCEEDED',
        details: { retryAfterSeconds: 10800 },
      }),
      t,
    )
    expect(message).toBe('errors.spotifyQuota:wait=errors.wait.hours:n=3')
  })

  it('localizes rate limit without relying on API message', () => {
    const message = getApiErrorMessage(
      new ApiError('Spotify rate limit. Wait about 20 seconds…', 429, {
        code: 'SPOTIFY_RATE_LIMITED',
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
})
