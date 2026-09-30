import type {
  AiGenerationFailureDto,
  AiGenerationUnmetConstraint,
  AiMoodUnmetReason,
} from '@blendify/contracts'
import type { MessageKey } from '@/i18n/messages'
import { formatSpotifyLimitMessage, getApiErrorMessage, isRequestLimited } from '@/lib/api-error'
import { formatListeningTime } from '@/lib/utils'
import { MOOD_LABEL_KEYS } from './ai-copy'

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

export type AiFailureRecovery = 'edit' | 'retry' | 'edit_or_retry'

export type AiFailureView = Readonly<{
  message: string
  hint: string | null
  recovery: AiFailureRecovery
  explainsSpotifyLimit?: boolean
}>

const PROVIDER_CATALOG_UNAVAILABLE_CODE = 'CATALOG_UNAVAILABLE'
const GENERATION_INTERRUPTED_CODE = 'AI_GENERATION_INTERRUPTED'

const MOOD_UNMET_REASON_KEYS: Record<AiMoodUnmetReason, MessageKey> = {
  seed_not_mood_based: 'ai.unmet.moodSeed',
  mood_not_enforced_for_explicit_genres: 'ai.unmet.moodGenres',
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
    failure.code === PROVIDER_CATALOG_UNAVAILABLE_CODE
      ? 'ai.generationError.spotifyUnavailable'
      : 'ai.generationError.discoveryUnavailable'
  return { message: t(key), hint: null, recovery: 'retry' }
}

export function generationFailureView(
  failure: AiGenerationFailureDto,
  liveError: unknown,
  t: Translate,
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
        message: t('ai.generationError.insufficient'),
        hint: null,
        recovery: 'edit_or_retry',
      }
    case 'failed':
      return {
        message:
          failure.code === GENERATION_INTERRUPTED_CODE
            ? t('ai.generationError.interrupted')
            : t('ai.generationError.failed'),
        hint: null,
        recovery: 'retry',
      }
  }
}

export function generationRequestErrorMessage(error: unknown, t: Translate): string {
  if (isRequestLimited(error)) {
    return getApiErrorMessage(error, t, 'ai.generationError.failed')
  }
  return t('ai.generationError.failed')
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
    case 'mood':
      return {
        key: constraint.type,
        label: `${t('ai.summary.mood')} · ${t(MOOD_LABEL_KEYS[constraint.mood])}`,
        message: t(MOOD_UNMET_REASON_KEYS[constraint.reason]),
      }
  }
}
