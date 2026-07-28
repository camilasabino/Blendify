import type { MessageKey } from '@/i18n/messages'

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly details?: Record<string, unknown>
  readonly body: unknown

  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
    if (typeof body === 'object' && body !== null) {
      const payload = body as {
        code?: unknown
        details?: unknown
      }
      if (typeof payload.code === 'string') this.code = payload.code
      if (
        payload.details &&
        typeof payload.details === 'object' &&
        !Array.isArray(payload.details)
      ) {
        this.details = payload.details as Record<string, unknown>
      }
    }
  }
}

export function isSpotifyRateLimited(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 429 ||
      error.code === 'SPOTIFY_RATE_LIMITED' ||
      error.code === 'SPOTIFY_QUOTA_EXCEEDED')
  )
}

function formatRetryWaitLabel(
  t: Translate,
  seconds: number | null | undefined,
  quotaExceeded: boolean,
): string {
  if (seconds != null && Number.isFinite(seconds) && seconds > 0) {
    if (seconds < 90) {
      return t('errors.wait.seconds', { n: Math.ceil(seconds) })
    }
    if (seconds < 3600) {
      return t('errors.wait.minutes', { n: Math.ceil(seconds / 60) })
    }
    return t('errors.wait.hours', { n: Math.ceil(seconds / 3600) })
  }
  return quotaExceeded
    ? t('errors.wait.severalHours')
    : t('errors.wait.seconds', { n: 20 })
}

export function getApiErrorMessage(
  error: unknown,
  t: Translate,
  fallbackKey: MessageKey = 'create.failed',
): string {
  if (!(error instanceof ApiError)) {
    return t(fallbackKey)
  }

  const retryRaw = error.details?.retryAfterSeconds
  const retryAfterSeconds =
    typeof retryRaw === 'number' && Number.isFinite(retryRaw)
      ? retryRaw
      : null

  if (error.code === 'SPOTIFY_QUOTA_EXCEEDED') {
    return t('errors.spotifyQuota', {
      wait: formatRetryWaitLabel(t, retryAfterSeconds, true),
    })
  }

  if (error.code === 'SPOTIFY_RATE_LIMITED' || error.status === 429) {
    return t('errors.spotifyRateLimit', {
      wait: formatRetryWaitLabel(t, retryAfterSeconds, false),
    })
  }

  if (error.code === 'TOO_MANY_ARTISTS') {
    const max = error.details?.max
    return typeof max === 'number'
      ? t('create.maxArtists', { max })
      : t(fallbackKey)
  }

  if (error.code === 'TOO_MANY_GENRES') {
    const max = error.details?.max
    return typeof max === 'number'
      ? t('create.maxGenres', { max })
      : t(fallbackKey)
  }

  if (error.code === 'EMPTY_ARTIST_SELECTION') return t('create.addArtist')
  if (error.code === 'EMPTY_GENRE_SELECTION') return t('create.addGenre')

  return t(fallbackKey)
}
