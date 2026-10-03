import type { GeneratedPlaylistDto, GenerationProgress } from '@blendify/contracts'
import type { MessageKey } from '@/i18n/messages'
import type { useT } from '@/i18n/use-t'
import type { PlaylistRunFailure } from '@/hooks/use-playlist-run'
import type { GenerationOutcome } from '@/lib/playlist-generation'
import { getApiErrorMessage, isSpotifyRateLimited, type EmptyResultFamily } from '@/lib/api'
import {
  classifyGenerationFailure,
  isWriteOutcomeUnknown,
  type GenerationFailure,
} from '@/lib/generation-failure'
import { toSafeHttpsUrl, toSpotifyUrl } from '@/lib/utils'

export function phaseMessageKey(phase: GenerationProgress['phase']): MessageKey {
  switch (phase) {
    case 'resolving_seeds':
      return 'create.progressResolving'
    case 'matching_tracks':
      return 'create.progressMatching'
    case 'publishing':
      return 'create.progressPublishing'
  }
}

export type GuestArtwork = Readonly<{ imageUrl: string; spotifyUrl: string }>

export function guestArtwork(
  artwork: GeneratedPlaylistDto['coverArtwork'],
): GuestArtwork | null {
  const imageUrl = toSafeHttpsUrl(artwork?.imageUrl)
  const spotifyUrl = toSpotifyUrl(artwork?.spotifyUrl)
  return imageUrl && spotifyUrl ? { imageUrl, spotifyUrl } : null
}

export function runCoverError(
  coverRenderFailed: boolean | undefined,
  result: GenerationOutcome | null,
  t: ReturnType<typeof useT>,
): string | null {
  const coverUploadFailed =
    result?.mode === 'spotify' && result.playlist.coverUploadFailed === true
  return coverRenderFailed || coverUploadFailed ? t('create.coverFailed') : null
}

export type RunFailureKind = 'failed' | 'connection_lost' | 'unconfirmed' | 'incomplete'

export type RunFailureRecovery =
  | 'retry'
  | 'open_library'
  | 'open_playlist'
  | 'reconnect'
  | 'none'

export type RunFailureView = Readonly<{
  kind: RunFailureKind
  message: string
  recovery: RunFailureRecovery
  playlistUrl: string | null
  offersNewCreation: boolean
  explainsSpotifyLimit: boolean
}>

function incompleteMessageKey(
  details: Extract<GenerationFailure, { kind: 'incomplete' }>['details'],
): MessageKey {
  if (details.failedStep === 'save_to_library') {
    return 'create.incompleteLibrary'
  }
  return details.tracksAdded === 'none'
    ? 'create.incompleteNoTracks'
    : 'create.incompleteUnknownTracks'
}

export function blocksImplicitResubmit(failure: PlaylistRunFailure | null): boolean {
  return failure !== null && isWriteOutcomeUnknown(failure.error, failure.isOutcomeUncertain)
}

export function runFailureView(
  failure: PlaylistRunFailure | null,
  libraryAvailable: boolean,
  t: ReturnType<typeof useT>,
  fallbackKey: MessageKey,
  emptyResult: EmptyResultFamily = 'mix',
): RunFailureView | null {
  if (!failure) {
    return null
  }
  const classified = classifyGenerationFailure(failure.error, failure.isOutcomeUncertain)
  switch (classified.kind) {
    case 'incomplete': {
      const playlistUrl = toSpotifyUrl(classified.details.spotifyUrl)
      return {
        kind: 'incomplete',
        message: t(incompleteMessageKey(classified.details)),
        recovery: playlistUrl ? 'open_playlist' : 'none',
        playlistUrl,
        offersNewCreation: false,
        explainsSpotifyLimit: false,
      }
    }
    case 'unconfirmed':
      return {
        kind: 'unconfirmed',
        message: t('create.unconfirmed'),
        recovery: 'none',
        playlistUrl: null,
        offersNewCreation: true,
        explainsSpotifyLimit: false,
      }
    case 'connection_lost':
      return {
        kind: 'connection_lost',
        message: t(libraryAvailable ? 'create.uncertainLibrary' : 'create.uncertainSpotify'),
        recovery: libraryAvailable ? 'open_library' : 'none',
        playlistUrl: null,
        offersNewCreation: true,
        explainsSpotifyLimit: false,
      }
    case 'reauth':
    case 'blocked':
    case 'retryable':
      return {
        kind: 'failed',
        message: getApiErrorMessage(failure.error, t, fallbackKey, emptyResult),
        recovery: RECOVERY_BY_KIND[classified.kind],
        playlistUrl: null,
        offersNewCreation: false,
        explainsSpotifyLimit:
          classified.kind === 'retryable' && isSpotifyRateLimited(failure.error),
      }
  }
}

const RECOVERY_BY_KIND = {
  reauth: 'reconnect',
  blocked: 'none',
  retryable: 'retry',
} as const satisfies Record<string, RunFailureRecovery>
