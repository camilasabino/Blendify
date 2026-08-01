import type { MessageKey } from '@/i18n/messages'
import { ApiErrorResponseSchema } from '@blendify/contracts'

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
    const parsed = ApiErrorResponseSchema.safeParse(body)
    if (parsed.success) {
      this.code = parsed.data.code
      this.details = parsed.data.details
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

  if (error.code === 'LASTFM_NOT_CONFIGURED') return t('errors.lastfmMissing')
  if (error.code === 'LASTFM_SIMILAR_FAILED') return t('errors.lastfmSimilar')
  if (error.code === 'DISCOVER_NOT_ENOUGH_SIMILAR')
    return t('discover.notEnoughSimilar')
  if (error.code === 'DISCOVER_RESOLVE_FAILED')
    return t('discover.resolveFailed')
  if (error.code === 'GENRE_LOOKUP_UNAVAILABLE')
    return t('errors.genreLookupUnavailable')
  if (error.code === 'ARTIST_RESOLVE_FAILED') {
    const name = error.details?.name
    return typeof name === 'string'
      ? t('errors.artistResolveNamed', { name })
      : t('errors.artistResolve')
  }

  if (error.code === 'EMPTY_ARTIST_SELECTION') return t('create.addArtist')
  if (error.code === 'EMPTY_GENRE_SELECTION') return t('create.addGenre')
  if (error.code === 'NO_TRACKS_FOUND') return t('create.noTracksFound')
  if (error.code === 'PREMIUM_REQUIRED') return t('preview.premiumRequired')
  if (error.code === 'PLAYBACK_UNAUTHORIZED')
    return t('preview.sessionExpired')
  if (error.code === 'PLAYBACK_INVALID')
    return t('preview.invalidPlayback')
  if (error.code === 'PLAYBACK_FAILED') return t('preview.playError')

  return t(fallbackKey)
}
