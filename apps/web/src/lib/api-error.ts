import type { MessageKey } from '@/i18n/messages'
import {
  ApiErrorResponseSchema,
  SpotifyWaitSourceSchema,
  type SpotifyWaitSource,
} from '@blendify/contracts'

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

export const GENERATION_STREAM_INTERRUPTED = 'GENERATION_STREAM_INTERRUPTED'

export function interruptedGenerationError(): ApiError {
  const message = 'Generation stream ended without a result'
  return new ApiError(message, 502, {
    statusCode: 502,
    code: GENERATION_STREAM_INTERRUPTED,
    message,
  })
}

export const SPOTIFY_OUTCOME_UNKNOWN = 'SPOTIFY_OUTCOME_UNKNOWN'
export const SPOTIFY_PLAYLIST_INCOMPLETE = 'SPOTIFY_PLAYLIST_INCOMPLETE'

const SERVER_RETRIED_PROVIDER_CODES = new Set([
  'SPOTIFY_UNAVAILABLE',
  'SPOTIFY_REQUEST_REJECTED',
  'SPOTIFY_PERMISSION_DENIED',
  'SPOTIFY_REAUTH_REQUIRED',
  'CATALOG_UNAVAILABLE',
])

export function isGenerationOutcomeUncertain(error: unknown): boolean {
  if (error instanceof ApiError) {
    return (
      error.code === GENERATION_STREAM_INTERRUPTED ||
      error.code === SPOTIFY_OUTCOME_UNKNOWN
    )
  }
  return error instanceof TypeError
}

export function isSpotifyProviderFailure(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.code !== undefined &&
    SERVER_RETRIED_PROVIDER_CODES.has(error.code)
  )
}

type RequestLimitMessageKeys = Readonly<{ wait: MessageKey; later: MessageKey }>

const REQUEST_LIMIT_MESSAGES: Record<string, RequestLimitMessageKeys> = {
  RATE_LIMITED: { wait: 'errors.rateLimited', later: 'errors.rateLimitedLater' },
  CONCURRENCY_LIMITED: {
    wait: 'errors.concurrencyLimited',
    later: 'errors.concurrencyLimited',
  },
  CAPACITY_EXCEEDED: {
    wait: 'errors.capacityExceeded',
    later: 'errors.capacityExceededLater',
  },
  SERVICE_UNAVAILABLE: {
    wait: 'errors.serviceUnavailable',
    later: 'errors.serviceUnavailableLater',
  },
}

function requestLimitMessageKeys(error: unknown): RequestLimitMessageKeys | null {
  if (!(error instanceof ApiError) || !error.code) {
    return null
  }
  return Object.hasOwn(REQUEST_LIMIT_MESSAGES, error.code)
    ? REQUEST_LIMIT_MESSAGES[error.code]
    : null
}

export function isRequestLimited(error: unknown): boolean {
  return requestLimitMessageKeys(error) !== null
}

const SPOTIFY_THROTTLE_CODES = new Set(['SPOTIFY_RATE_LIMITED', 'SPOTIFY_QUOTA_EXCEEDED'])

export function isSpotifyRateLimited(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.code !== undefined &&
    SPOTIFY_THROTTLE_CODES.has(error.code)
  )
}

export function formatWaitLabel(
  t: Translate,
  seconds: number | null | undefined,
): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) {
    return null
  }
  if (seconds < 90) {
    return waitCountLabel(t, Math.ceil(seconds), 'errors.wait.oneSecond', 'errors.wait.seconds')
  }
  if (seconds < 3600) {
    return waitCountLabel(
      t,
      Math.ceil(seconds / 60),
      'errors.wait.oneMinute',
      'errors.wait.minutes',
    )
  }
  return waitCountLabel(t, Math.ceil(seconds / 3600), 'errors.wait.oneHour', 'errors.wait.hours')
}

function waitCountLabel(
  t: Translate,
  n: number,
  one: 'errors.wait.oneSecond' | 'errors.wait.oneMinute' | 'errors.wait.oneHour',
  many: 'errors.wait.seconds' | 'errors.wait.minutes' | 'errors.wait.hours',
): string {
  if (n === 1) {
    return t(one)
  }
  return t(many, { n })
}

export function readRetryAfterSeconds(details?: Record<string, unknown>): number | null {
  const retryRaw = details?.retryAfterSeconds
  if (typeof retryRaw === 'number' && Number.isFinite(retryRaw) && retryRaw > 0) {
    return retryRaw
  }
  return null
}

function readRetryAfterSource(details?: Record<string, unknown>): SpotifyWaitSource | null {
  const parsed = SpotifyWaitSourceSchema.safeParse(details?.retryAfterSource)
  return parsed.success ? parsed.data : null
}

export type SpotifyLimitWait = Readonly<{
  seconds: number | null | undefined
  source: SpotifyWaitSource | null | undefined
}>

export function formatSpotifyLimitMessage(t: Translate, wait: SpotifyLimitWait): string {
  const label = formatWaitLabel(t, wait.seconds)
  if (label && wait.source === 'spotify') {
    return t('errors.spotifyLimit.spotifyWait', { wait: label })
  }
  if (label && wait.source === 'blendify') {
    return t('errors.spotifyLimit.estimate', { wait: label })
  }
  return t('errors.spotifyLimit.unknown')
}

function mapSpotifyThrottleMessage(error: ApiError, t: Translate): string | null {
  if (!isSpotifyRateLimited(error)) {
    return null
  }
  return formatSpotifyLimitMessage(t, {
    seconds: readRetryAfterSeconds(error.details),
    source: readRetryAfterSource(error.details),
  })
}

function mapProviderWaitMessage(error: ApiError, t: Translate): string | null {
  if (error.code !== 'SPOTIFY_UNAVAILABLE' && error.code !== 'CATALOG_UNAVAILABLE') {
    return null
  }
  if (error.details?.retryAfterSource !== 'spotify') {
    return null
  }
  const wait = formatWaitLabel(t, readRetryAfterSeconds(error.details))
  return wait ? t('errors.spotifyUnavailableWait', { wait }) : null
}

function mapRequestLimitMessage(
  error: ApiError,
  t: Translate,
): string | null {
  const keys = requestLimitMessageKeys(error)
  if (!keys) {
    return null
  }
  if (error.code === 'CONCURRENCY_LIMITED') {
    return t(keys.later)
  }
  const wait = formatWaitLabel(t, readRetryAfterSeconds(error.details))
  return wait ? t(keys.wait, { wait }) : t(keys.later)
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
  SPOTIFY_REAUTH_REQUIRED: 'errors.spotifyReauthRequired',
  SPOTIFY_UNAVAILABLE: 'errors.spotifyUnavailable',
  SPOTIFY_PERMISSION_DENIED: 'errors.spotifyPermissionDenied',
  SPOTIFY_REQUEST_REJECTED: 'errors.spotifyRequestRejected',
  [SPOTIFY_OUTCOME_UNKNOWN]: 'errors.spotifyOutcomeUnknown',
  [SPOTIFY_PLAYLIST_INCOMPLETE]: 'errors.spotifyPlaylistIncomplete',
  [INVALID_GENERATION_RESPONSE]: 'errors.invalidGenerationResponse',
  TRANSFER_TOKEN_INVALID: 'transfer.errorInvalid',
  TRANSFER_TOKEN_EXPIRED: 'transfer.errorExpired',
  TRANSFER_PLAYLIST_REJECTED: 'transfer.errorRejected',
  AI_REFINEMENT_PENDING: 'ai.refine.pendingDestination',
}

function mapTransferUnavailableMessage(
  error: ApiError,
  t: Translate,
): string | null {
  if (error.code !== 'TRANSFER_PROVIDER_UNAVAILABLE') {
    return null
  }
  const wait = formatWaitLabel(t, readRetryAfterSeconds(error.details))
  return wait ? t('transfer.errorUnavailable', { wait }) : t('transfer.errorUnavailableLater')
}

function mapStaticCodeMessage(
  code: string | undefined,
  t: Translate,
): string | null {
  if (!code) {
    return null
  }
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
    mapProviderWaitMessage(error, t) ??
    mapMaxSelectionMessage(error, t, fallbackKey) ??
    mapNamedResolveMessage(error, t) ??
    mapStaticCodeMessage(error.code, t) ??
    t(fallbackKey)
  )
}

export type TransferErrorRecovery = 'regenerate' | 'retry' | 'none'

export function getTransferErrorRecovery(error: unknown): TransferErrorRecovery {
  if (!(error instanceof ApiError)) {
    return 'retry'
  }
  if (
    error.code === 'TRANSFER_TOKEN_EXPIRED' ||
    error.code === 'TRANSFER_TOKEN_INVALID'
  ) {
    return 'regenerate'
  }
  if (error.code === 'TRANSFER_PLAYLIST_REJECTED') {
    return 'none'
  }
  return 'retry'
}

export function getTransferErrorMessage(error: unknown, t: Translate): string {
  return getApiErrorMessage(error, t, 'transfer.failed')
}
