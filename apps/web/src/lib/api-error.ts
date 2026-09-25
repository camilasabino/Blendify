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

export const INVALID_GENERATION_RESPONSE = 'INVALID_GENERATION_RESPONSE'

export function invalidGenerationResponseError(): ApiError {
  const message = 'Invalid generation response'
  return new ApiError(message, 502, {
    statusCode: 502,
    code: INVALID_GENERATION_RESPONSE,
    message,
  })
}

const REQUEST_LIMIT_MESSAGES: Record<string, MessageKey> = {
  RATE_LIMITED: 'errors.rateLimited',
  CONCURRENCY_LIMITED: 'errors.concurrencyLimited',
  CAPACITY_EXCEEDED: 'errors.capacityExceeded',
  SERVICE_UNAVAILABLE: 'errors.serviceUnavailable',
}

function requestLimitMessageKey(error: unknown): MessageKey | null {
  if (!(error instanceof ApiError) || !error.code) return null
  return Object.hasOwn(REQUEST_LIMIT_MESSAGES, error.code)
    ? REQUEST_LIMIT_MESSAGES[error.code]
    : null
}

export function isRequestLimited(error: unknown): boolean {
  return requestLimitMessageKey(error) !== null
}

export function isSpotifyRateLimited(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    !isRequestLimited(error) &&
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

function mapRequestLimitMessage(
  error: ApiError,
  t: Translate,
): string | null {
  const key = requestLimitMessageKey(error)
  if (!key) return null
  if (error.code === 'CONCURRENCY_LIMITED') return t(key)
  return t(key, {
    wait: formatRetryWaitLabel(t, readRetryAfterSeconds(error.details), false),
  })
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
  CATALOG_UNAVAILABLE: 'errors.catalogUnavailable',
  [INVALID_GENERATION_RESPONSE]: 'errors.invalidGenerationResponse',
  TRANSFER_TOKEN_INVALID: 'transfer.errorInvalid',
  TRANSFER_TOKEN_EXPIRED: 'transfer.errorExpired',
  TRANSFER_PLAYLIST_REJECTED: 'transfer.errorRejected',
}

function mapTransferUnavailableMessage(
  error: ApiError,
  t: Translate,
): string | null {
  if (error.code !== 'TRANSFER_PROVIDER_UNAVAILABLE') return null
  return t('transfer.errorUnavailable', {
    wait: formatRetryWaitLabel(t, readRetryAfterSeconds(error.details), false),
  })
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
    mapRequestLimitMessage(error, t) ??
    mapTransferUnavailableMessage(error, t) ??
    mapSpotifyThrottleMessage(error, t) ??
    mapMaxSelectionMessage(error, t, fallbackKey) ??
    mapNamedResolveMessage(error, t) ??
    mapStaticCodeMessage(error.code, t) ??
    t(fallbackKey)
  )
}

export type TransferErrorRecovery = 'regenerate' | 'retry' | 'none'

export function getTransferErrorRecovery(error: unknown): TransferErrorRecovery {
  if (!(error instanceof ApiError)) return 'retry'
  if (
    error.code === 'TRANSFER_TOKEN_EXPIRED' ||
    error.code === 'TRANSFER_TOKEN_INVALID'
  ) {
    return 'regenerate'
  }
  if (error.code === 'TRANSFER_PLAYLIST_REJECTED') return 'none'
  return 'retry'
}

export function getTransferErrorMessage(error: unknown, t: Translate): string {
  return getApiErrorMessage(error, t, 'transfer.failed')
}
