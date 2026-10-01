import type {
  AiIntentChangeDto,
  AiRefinementClarificationDto,
  AiTrackReference,
  PlaylistKind,
} from '@blendify/contracts'
import { REGION_LABEL_KEYS, type GenreLabelSource } from '@/components/genres/genre-labels'
import type { MessageKey } from '@/i18n/messages'
import { ApiError, getApiErrorMessage, isRequestLimited } from '@/lib/api-error'
import {
  aiErrorMessage,
  clarificationMessage,
  MOOD_LABEL_KEYS,
  ORDER_LABEL_KEYS,
  POPULARITY_LABEL_KEYS,
} from './ai-copy'

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

export type IntentChangeView =
  | Readonly<{ key: string; label: string; type: 'value'; from: string; to: string }>
  | Readonly<{ key: string; label: string; type: 'list'; added: string[]; removed: string[] }>

const KIND_LABEL_KEYS: Record<PlaylistKind, MessageKey> = {
  artist_mix: 'ai.refine.kind.artist_mix',
  genre_mix: 'ai.refine.kind.genre_mix',
  discover_artist: 'ai.refine.kind.discover_artist',
  discover_track: 'ai.refine.kind.discover_track',
}

const LIST_FIELD_LABEL_KEYS = {
  artists: 'ai.refine.field.artists',
  genres: 'ai.refine.field.genres',
  excludeArtists: 'ai.refine.field.excludeArtists',
  seedTracks: 'ai.refine.field.seedTracks',
  excludeTracks: 'ai.refine.field.excludeTracks',
} as const satisfies Record<string, MessageKey>

const REFINEMENT_ERROR_KEYS: Record<string, MessageKey> = {
  AI_REFINEMENT_IN_PROGRESS: 'ai.refine.error.inProgress',
  AI_REFINEMENT_LIMIT_REACHED: 'ai.refine.error.limit',
  AI_REFINEMENT_SUPERSEDED: 'ai.refine.error.superseded',
  AI_REFINEMENT_UNAVAILABLE: 'ai.refine.error.unavailable',
  AI_REFINEMENT_PENDING: 'ai.refine.error.pending',
  AI_REFINEMENT_STALE: 'ai.refine.error.stale',
  AI_REFINEMENT_NOT_APPLICABLE: 'ai.refine.error.stale',
}

const INTERPRETATION_ERROR_CODES = new Set([
  'AI_UNAVAILABLE',
  'AI_TIMEOUT',
  'AI_RATE_LIMITED',
  'AI_INVALID_OUTPUT',
  'AI_REQUEST_REJECTED',
  'AI_SESSION_NOT_FOUND',
])

export function refinementErrorMessage(
  error: unknown,
  t: Translate,
  fallbackKey: MessageKey,
): string {
  if (error instanceof ApiError && error.code) {
    if (Object.hasOwn(REFINEMENT_ERROR_KEYS, error.code)) {
      return t(REFINEMENT_ERROR_KEYS[error.code])
    }
    if (INTERPRETATION_ERROR_CODES.has(error.code)) {
      return aiErrorMessage(error, t)
    }
  }
  if (isRequestLimited(error)) {
    return getApiErrorMessage(error, t, fallbackKey)
  }
  return t(fallbackKey)
}

export function refinementClarificationMessage(
  clarification: AiRefinementClarificationDto,
  t: Translate,
): string {
  const names = clarification.names.join(', ')

  switch (clarification.reason) {
    case 'ambiguous_request':
      return t('ai.refine.clarify.ambiguous')
    case 'unsupported_constraint':
      return unsupportedRefinementMessage(clarification, t)
    case 'not_a_playlist_request':
      return t('ai.refine.clarify.notARefinement')
    case 'mixed_seed_types':
      return t('ai.refine.clarify.mixedSeeds')
    case 'unsupported_ordering':
      return t('ai.refine.clarify.ordering')
    case 'conflicting_changes':
      if (clarification.limit !== null) {
        return t('ai.refine.clarify.conflictingLimit', { limit: clarification.limit })
      }
      return names
        ? t('ai.refine.clarify.conflictingNamed', { names })
        : t('ai.refine.clarify.conflicting')
    case 'preserved_track_out_of_range':
      return t('ai.refine.clarify.outOfRange', { limit: clarification.limit ?? 0 })
    case 'preserved_artist_not_found':
      return t('ai.refine.clarify.artistNotKept', { names })
    case 'too_many_seeds':
      return tooManyRefinementSeedsMessage(clarification, t)
    default:
      return clarificationMessage({ ...clarification, reason: clarification.reason }, t)
  }
}

function tooManyRefinementSeedsMessage(
  clarification: AiRefinementClarificationDto,
  t: Translate,
): string {
  const count = clarification.names.length
  const limit = clarification.limit ?? 0

  if (clarification.seedType === 'track') {
    return t('ai.refine.clarify.singleTrack')
  }
  if (clarification.seedType === 'genre') {
    return t('ai.refine.clarify.tooManyGenres', { limit, count })
  }
  return limit === 1
    ? t('ai.refine.clarify.singleArtist')
    : t('ai.refine.clarify.tooManyArtists', { limit, count })
}

function unsupportedRefinementMessage(
  clarification: AiRefinementClarificationDto,
  t: Translate,
): string {
  if (clarification.unsupportedConstraints.some((constraint) => constraint.category === 'genre_exclusion')) {
    return t('ai.refine.clarify.genreExclusion')
  }
  const items = clarification.unsupportedConstraints
    .map((constraint) => `“${constraint.userText}”`)
    .join(', ')
  return items
    ? t('ai.refine.clarify.unsupportedNamed', { items })
    : t('ai.refine.clarify.unsupported')
}

function trackLabel(track: AiTrackReference, t: Translate): string {
  return track.artist
    ? t('ai.summary.trackBy', { title: track.title, artist: track.artist })
    : track.title
}

function countLabel(value: number | null, t: Translate): string {
  return value === null ? t('ai.refine.diff.notSet') : String(value)
}

function minutesLabel(value: number | null, t: Translate): string {
  return value === null
    ? t('ai.refine.diff.notSet')
    : t('ai.summary.durationValue', { minutes: value })
}

export function intentChangeView(
  change: AiIntentChangeDto,
  t: Translate,
  genreLabel: (genre: GenreLabelSource) => string,
): IntentChangeView {
  const key = change.field
  switch (change.field) {
    case 'kind':
      return {
        key,
        type: 'value',
        label: t('ai.refine.field.kind'),
        from: t(KIND_LABEL_KEYS[change.from]),
        to: t(KIND_LABEL_KEYS[change.to]),
      }
    case 'genres':
      return {
        key,
        type: 'list',
        label: t(LIST_FIELD_LABEL_KEYS[change.field]),
        added: change.added.map((name) => genreLabel({ name })),
        removed: change.removed.map((name) => genreLabel({ name })),
      }
    case 'artists':
    case 'excludeArtists':
      return {
        key,
        type: 'list',
        label: t(LIST_FIELD_LABEL_KEYS[change.field]),
        added: change.added,
        removed: change.removed,
      }
    case 'seedTracks':
    case 'excludeTracks':
      return {
        key,
        type: 'list',
        label: t(LIST_FIELD_LABEL_KEYS[change.field]),
        added: change.added.map((track) => trackLabel(track, t)),
        removed: change.removed.map((track) => trackLabel(track, t)),
      }
    case 'targetTrackCount':
      return {
        key,
        type: 'value',
        label: t('ai.summary.songs'),
        from: countLabel(change.from, t),
        to: countLabel(change.to, t),
      }
    case 'targetDurationMinutes':
      return {
        key,
        type: 'value',
        label: t('ai.summary.duration'),
        from: minutesLabel(change.from, t),
        to: minutesLabel(change.to, t),
      }
    case 'region':
      return {
        key,
        type: 'value',
        label: t('ai.summary.region'),
        from: change.from ? t(REGION_LABEL_KEYS[change.from]) : t('create.regionAny'),
        to: change.to ? t(REGION_LABEL_KEYS[change.to]) : t('create.regionAny'),
      }
    case 'mood':
      return {
        key,
        type: 'value',
        label: t('ai.summary.mood'),
        from: change.from ? t(MOOD_LABEL_KEYS[change.from]) : t('ai.refine.diff.noMood'),
        to: change.to ? t(MOOD_LABEL_KEYS[change.to]) : t('ai.refine.diff.noMood'),
      }
    case 'popularity':
      return {
        key,
        type: 'value',
        label: t('create.reach'),
        from: t(POPULARITY_LABEL_KEYS[change.from ?? 'balanced']),
        to: t(POPULARITY_LABEL_KEYS[change.to ?? 'balanced']),
      }
    case 'orderMode':
      return {
        key,
        type: 'value',
        label: t('create.order'),
        from: change.from ? t(ORDER_LABEL_KEYS[change.from]) : t('ai.refine.diff.defaultOrder'),
        to: change.to ? t(ORDER_LABEL_KEYS[change.to]) : t('ai.refine.diff.defaultOrder'),
      }
  }
}
