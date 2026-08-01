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

function readRetryAfterSeconds(details?: Record<string, unknown>): number | null {
  const retryRaw = details?.retryAfterSeconds
  if (typeof retryRaw === 'number' && Number.isFinite(retryRaw)) return retryRaw
  return null
}

function mapSpotifyThrottleMessage(
  error: ApiError,
  t: Translate,
): string | null {
  const retryAfterSeconds = readRetryAfterSeconds(error.details)
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
  return null
}

function mapMaxSelectionMessage(
  error: ApiError,
  t: Translate,
  fallbackKey: MessageKey,
): string | null {
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
  return null
}

function mapNamedResolveMessage(
  error: ApiError,
  t: Translate,
): string | null {
  if (error.code === 'ARTIST_RESOLVE_FAILED') {
    const name = error.details?.name
    return typeof name === 'string'
      ? t('errors.artistResolveNamed', { name })
      : t('errors.artistResolve')
  }
  if (error.code === 'TRACK_RESOLVE_FAILED') {
    const name = error.details?.name
    return typeof name === 'string'
      ? t('errors.trackResolveNamed', { name })
      : t('discover.resolveFailed')
  }
  return null
}

const STATIC_ERROR_MESSAGES: Record<string, MessageKey> = {
  LASTFM_NOT_CONFIGURED: 'errors.lastfmMissing',
  LASTFM_SIMILAR_FAILED: 'errors.lastfmSimilar',
  DISCOVER_NOT_ENOUGH_SIMILAR: 'discover.notEnoughSimilar',
  DISCOVER_RESOLVE_FAILED: 'discover.resolveFailed',
  GENRE_LOOKUP_UNAVAILABLE: 'errors.genreLookupUnavailable',
  EMPTY_ARTIST_SELECTION: 'create.addArtist',
  EMPTY_GENRE_SELECTION: 'create.addGenre',
  NO_TRACKS_FOUND: 'create.noTracksFound',
  PREMIUM_REQUIRED: 'preview.premiumRequired',
  PLAYBACK_UNAUTHORIZED: 'preview.sessionExpired',
  PLAYBACK_INVALID: 'preview.invalidPlayback',
  PLAYBACK_FAILED: 'preview.playError',
}

function mapStaticCodeMessage(
  code: string | undefined,
  t: Translate,
): string | null {
  if (!code) return null
  const key = STATIC_ERROR_MESSAGES[code]
  return key ? t(key) : null
}

export function getApiErrorMessage(
  error: unknown,
  t: Translate,
  fallbackKey: MessageKey = 'create.failed',
): string {
  if (!(error instanceof ApiError)) {
    return t(fallbackKey)
  }

  return (
    mapSpotifyThrottleMessage(error, t) ??
    mapMaxSelectionMessage(error, t, fallbackKey) ??
    mapNamedResolveMessage(error, t) ??
    mapStaticCodeMessage(error.code, t) ??
    t(fallbackKey)
  )
}
