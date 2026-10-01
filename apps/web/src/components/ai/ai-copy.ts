import type {
  AiClarification,
  AiClarificationOption,
  AiMood,
  AiMoodNotAppliedReason,
  AiUnsupportedConstraintCategory,
  PlaylistKind,
  PopularityMode,
  TrackOrderMode,
} from '@blendify/contracts'
import type { GenreLabelSource } from '@/components/genres/genre-labels'
import type { MessageKey } from '@/i18n/messages'
import { ApiError, getApiErrorMessage } from '@/lib/api-error'

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

export const POPULARITY_LABEL_KEYS: Record<PopularityMode, MessageKey> = {
  popular: 'create.mix.popular',
  balanced: 'create.mix.balanced',
  rarities: 'create.mix.rarities',
}

export const ORDER_LABEL_KEYS: Record<TrackOrderMode, MessageKey> = {
  artist: 'create.order.artist',
  title: 'create.order.title',
  random: 'create.order.random',
}

export const MOOD_LABEL_KEYS: Record<AiMood, MessageKey> = {
  happy: 'ai.mood.happy',
  calm: 'ai.mood.calm',
  energetic: 'ai.mood.energetic',
  sad: 'ai.mood.sad',
  romantic: 'ai.mood.romantic',
  angry: 'ai.mood.angry',
  dark: 'ai.mood.dark',
  nostalgic: 'ai.mood.nostalgic',
  dreamy: 'ai.mood.dreamy',
}

export const MOOD_NOT_APPLIED_REASON_KEYS: Record<AiMoodNotAppliedReason, MessageKey> = {
  seed_not_mood_based: 'ai.moodNotApplied.seed',
  explicit_genre_precedence: 'ai.moodNotApplied.explicitGenre',
}

export const CATEGORY_LABEL_KEYS: Record<AiUnsupportedConstraintCategory, MessageKey> = {
  duration: 'ai.category.duration',
  era: 'ai.category.era',
  energy: 'ai.category.energy',
  mood: 'ai.category.mood',
  activity: 'ai.category.activity',
  tempo: 'ai.category.tempo',
  progression: 'ai.category.progression',
  artist_attribute: 'ai.category.artist_attribute',
  genre_exclusion: 'ai.category.genre_exclusion',
  other: 'ai.category.other',
}

const AI_ERROR_KEYS: Record<string, MessageKey> = {
  AI_UNAVAILABLE: 'ai.error.unavailable',
  AI_TIMEOUT: 'ai.error.timeout',
  AI_RATE_LIMITED: 'ai.error.rateLimited',
  AI_INVALID_OUTPUT: 'ai.error.invalidOutput',
  AI_REQUEST_REJECTED: 'ai.error.requestRejected',
  AI_SESSION_NOT_FOUND: 'ai.error.sessionExpired',
  AI_CLARIFICATION_OPTION_UNAVAILABLE: 'ai.error.optionUnavailable',
}

const NON_RETRYABLE_REQUEST_CODES = new Set([
  'AI_REQUEST_REJECTED',
  'AI_SESSION_NOT_FOUND',
  'AI_CLARIFICATION_OPTION_UNAVAILABLE',
  'VALIDATION_ERROR',
])

export function aiErrorMessage(error: unknown, t: Translate): string {
  if (error instanceof ApiError && error.code && Object.hasOwn(AI_ERROR_KEYS, error.code)) {
    return t(AI_ERROR_KEYS[error.code])
  }
  return getApiErrorMessage(error, t, 'ai.error.generic')
}

export function canRetryAiRequest(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return true
  }
  if (error.code && NON_RETRYABLE_REQUEST_CODES.has(error.code)) {
    return false
  }
  return error.status === 408 || error.status === 429 || error.status >= 500
}

export type AiClarificationDetails = Pick<
  AiClarification,
  'reason' | 'seedType' | 'limit' | 'names'
> &
  Partial<Pick<AiClarification, 'options'>>

export function clarificationMessage(clarification: AiClarificationDetails, t: Translate): string {
  const names = clarification.names.join(', ')
  const limit = clarification.limit ?? 0

  switch (clarification.reason) {
    case 'ambiguous_request':
      return t('ai.clarify.ambiguous')
    case 'unsupported_constraint':
      return t('ai.clarify.unsupportedOnly')
    case 'not_a_playlist_request':
      return t('ai.clarify.notAPlaylist')
    case 'mixed_seed_types':
      return t('ai.clarify.mixedSeeds')
    case 'too_many_seeds':
      return tooManySeedsMessage(clarification, t)
    case 'track_count_over_limit':
      return t('ai.clarify.trackCount', { limit })
    case 'invalid_duration':
      return t('ai.clarify.invalidDuration')
    case 'unsupported_ordering':
      return t('ai.clarify.ordering')
    case 'unknown_genres':
      return t('ai.clarify.unknownGenres', { names })
    case 'ambiguous_genres':
      return t('ai.clarify.ambiguousGenres', { names })
    case 'conflicting_regions':
      return t('ai.clarify.conflictingRegions', { names })
  }
}

function tooManySeedsMessage(clarification: AiClarificationDetails, t: Translate): string {
  const count = clarification.names.length
  const limit = clarification.limit ?? 0

  if (clarification.seedType === 'track') {
    return t('ai.clarify.singleTrack')
  }
  if (clarification.seedType === 'genre') {
    return t('ai.clarify.tooManyGenres', { limit, count })
  }
  if (limit !== 1) {
    return t('ai.clarify.tooManyArtists', { limit, count })
  }
  const canMix = clarification.options?.some((option) => option.type === 'set_kind') ?? false
  return canMix ? t('ai.clarify.singleArtist') : t('ai.clarify.singleArtistOnly')
}

export function optionLabel(
  option: AiClarificationOption,
  clarification: AiClarification,
  t: Translate,
  genreLabel: (genre: GenreLabelSource) => string,
): string {
  switch (option.type) {
    case 'set_kind':
      if (clarification.reason === 'too_many_seeds') {
        return t('ai.option.mixArtists')
      }
      return t(SEED_KIND_OPTION_KEYS[option.kind])
    case 'keep_seed':
      return t('ai.option.keepSeed', {
        name: option.seedType === 'genre' ? genreLabel({ name: option.label }) : option.label,
      })
    case 'set_track_count':
      return t('ai.option.trackCount', { count: option.trackCount })
    case 'set_order_mode':
      return t(ORDER_LABEL_KEYS[option.orderMode])
  }
}

const SEED_KIND_OPTION_KEYS: Record<PlaylistKind, MessageKey> = {
  artist_mix: 'ai.option.useArtists',
  discover_artist: 'ai.option.useArtists',
  genre_mix: 'ai.option.useGenres',
  discover_track: 'ai.option.useSong',
}
