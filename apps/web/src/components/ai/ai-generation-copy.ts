import type {
  AiGenerationFailureDto,
  AiGenerationUnmetConstraint,
  PlaylistKind,
} from '@blendify/contracts'
import type { MessageKey } from '@/i18n/messages'
import {
  ApiError,
  formatSpotifyLimitMessage,
  getApiErrorMessage,
  isRequestLimited,
  type EmptyResultFamily,
} from '@/lib/api-error'
import { formatListeningTime } from '@/lib/utils'

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

export type AiFailureRecovery = 'edit' | 'retry' | 'edit_or_retry'

export type AiFailureView = Readonly<{
  message: string
  hint: string | null
  recovery: AiFailureRecovery
  explainsSpotifyLimit?: boolean
}>

const PROVIDER_CATALOG_UNAVAILABLE_CODE = 'CATALOG_UNAVAILABLE'
const SPOTIFY_UNAVAILABLE_CODE = 'SPOTIFY_UNAVAILABLE'
const GENERATION_INTERRUPTED_CODE = 'AI_GENERATION_INTERRUPTED'
const DISCOVER_EMPTY_RESULT_CODES = new Set([
  'DISCOVER_NOT_ENOUGH_SIMILAR',
  'DISCOVER_RESOLVE_FAILED',
])

function emptyResultFamilyFor(kind: PlaylistKind): EmptyResultFamily {
  return kind === 'discover_artist' || kind === 'discover_track' ? 'discover' : 'mix'
}

function insufficientMessageKey(code: string, kind: PlaylistKind): MessageKey {
  if (DISCOVER_EMPTY_RESULT_CODES.has(code) || emptyResultFamilyFor(kind) === 'discover') {
    return 'discover.noTracksFound'
  }
  return 'create.noTracksFound'
}

function persistedFailureError(failure: AiGenerationFailureDto): ApiError {
  const details: Record<string, unknown> = {}
  if (typeof failure.retryAfterSeconds === 'number') {
    details.retryAfterSeconds = failure.retryAfterSeconds
  }
  if (failure.retryAfterSource) {
    details.retryAfterSource = failure.retryAfterSource
  }
  return new ApiError(failure.code, 500, {
    statusCode: 500,
    code: failure.code,
    message: failure.code,
    ...(Object.keys(details).length > 0 ? { details } : {}),
  })
}

function seedNotFoundView(failure: AiGenerationFailureDto, t: Translate): AiFailureView {
  const names = failure.seedNotFound?.names ?? []
  const message =
    names.length > 0
      ? t('ai.generationError.seedNotFound', {
          names: names.map((name) => `“${name}”`).join(', '),
        })
      : t('ai.generationError.seedNotFoundGeneric')
  return { message, hint: t('ai.generationError.seedNotFoundHint'), recovery: 'edit' }
}

function rateLimitedView(failure: AiGenerationFailureDto, t: Translate): AiFailureView {
  const message = formatSpotifyLimitMessage(t, {
    seconds: failure.retryAfterSeconds,
    source: failure.retryAfterSource,
  })
  return { message, hint: null, recovery: 'retry', explainsSpotifyLimit: true }
}

function providerUnavailableView(failure: AiGenerationFailureDto, t: Translate): AiFailureView {
  const key: MessageKey =
    failure.code === PROVIDER_CATALOG_UNAVAILABLE_CODE || failure.code === SPOTIFY_UNAVAILABLE_CODE
      ? 'ai.generationError.spotifyUnavailable'
      : 'ai.generationError.discoveryUnavailable'
  return { message: t(key), hint: null, recovery: 'retry' }
}

function failedGenerationView(
  failure: AiGenerationFailureDto,
  t: Translate,
  family: EmptyResultFamily,
): AiFailureView {
  if (failure.code === GENERATION_INTERRUPTED_CODE) {
    return { message: t('ai.generationError.interrupted'), hint: null, recovery: 'retry' }
  }
  return {
    message: getApiErrorMessage(persistedFailureError(failure), t, 'ai.generationError.failed', family),
    hint: null,
    recovery: 'retry',
  }
}

export function generationFailureView(
  failure: AiGenerationFailureDto,
  liveError: unknown,
  t: Translate,
  kind: PlaylistKind = 'artist_mix',
): AiFailureView {
  if (isRequestLimited(liveError)) {
    return {
      message: getApiErrorMessage(liveError, t, 'ai.generationError.failed'),
      hint: null,
      recovery: 'retry',
    }
  }

  switch (failure.category) {
    case 'seed_not_found':
      return seedNotFoundView(failure, t)
    case 'provider_rate_limited':
      return rateLimitedView(failure, t)
    case 'provider_unavailable':
      return providerUnavailableView(failure, t)
    case 'insufficient_results':
      return {
        message: t(insufficientMessageKey(failure.code, kind)),
        hint: null,
        recovery: 'edit_or_retry',
      }
    case 'failed':
      return failedGenerationView(failure, t, emptyResultFamilyFor(kind))
  }
}

export function generationRequestErrorMessage(
  error: unknown,
  t: Translate,
  kind: PlaylistKind = 'artist_mix',
): string {
  return getApiErrorMessage(
    error,
    t,
    'ai.generationError.failed',
    emptyResultFamilyFor(kind),
  )
}

export type UnmetConstraintView = Readonly<{ key: string; label: string; message: string }>

export function unmetConstraintView(
  constraint: AiGenerationUnmetConstraint,
  t: Translate,
): UnmetConstraintView {
  switch (constraint.type) {
    case 'track_count':
      return {
        key: constraint.type,
        label: t('ai.summary.songs'),
        message: t('ai.unmet.trackCount', {
          requested: constraint.requested,
          actual: constraint.actual,
        }),
      }
    case 'duration':
      return {
        key: constraint.type,
        label: t('ai.summary.duration'),
        message: t('ai.unmet.duration', {
          requested: constraint.requestedMinutes,
          actual: formatListeningTime(constraint.actualDurationMs),
        }),
      }
  }
}
