import {
  PlaylistPublishIncompleteDetailsSchema,
  type PlaylistPublishIncompleteDetails,
} from '@blendify/contracts'
import {
  ApiError,
  SPOTIFY_OUTCOME_UNKNOWN,
  SPOTIFY_PLAYLIST_INCOMPLETE,
} from '@/lib/api-error'

export type GenerationFailure =
  | { kind: 'retryable' }
  | { kind: 'connection_lost' }
  | { kind: 'unconfirmed' }
  | { kind: 'incomplete'; details: PlaylistPublishIncompleteDetails }
  | { kind: 'reauth' }
  | { kind: 'blocked' }

export function classifyGenerationFailure(
  error: unknown,
  isOutcomeUncertain: boolean,
): GenerationFailure {
  if (error instanceof ApiError) {
    if (error.code === SPOTIFY_PLAYLIST_INCOMPLETE) {
      const details = PlaylistPublishIncompleteDetailsSchema.safeParse(error.details)
      return details.success
        ? { kind: 'incomplete', details: details.data }
        : { kind: 'unconfirmed' }
    }
    if (error.code === SPOTIFY_OUTCOME_UNKNOWN) {
      return { kind: 'unconfirmed' }
    }
    if (error.code === 'SPOTIFY_REAUTH_REQUIRED') {
      return { kind: 'reauth' }
    }
    if (error.code === 'SPOTIFY_PERMISSION_DENIED') {
      return { kind: 'blocked' }
    }
  }
  return isOutcomeUncertain ? { kind: 'connection_lost' } : { kind: 'retryable' }
}

export function canRetryGeneration(error: unknown, isOutcomeUncertain: boolean): boolean {
  return classifyGenerationFailure(error, isOutcomeUncertain).kind === 'retryable'
}

export function isWriteOutcomeUnknown(error: unknown, isOutcomeUncertain: boolean): boolean {
  const { kind } = classifyGenerationFailure(error, isOutcomeUncertain)
  return kind === 'unconfirmed' || kind === 'connection_lost'
}
