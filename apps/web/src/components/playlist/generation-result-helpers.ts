import type { GeneratedPlaylistDto, GenerationProgress } from '@blendify/contracts'
import type { MessageKey } from '@/i18n/messages'
import type { useT } from '@/i18n/use-t'
import type { PlaylistRunFailure } from '@/hooks/use-playlist-run'
import { getApiErrorMessage } from '@/lib/api'
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

export function runFailureMessage(
  failure: PlaylistRunFailure | null,
  libraryAvailable: boolean,
  t: ReturnType<typeof useT>,
  fallbackKey: MessageKey,
): string | null {
  if (!failure) {
    return null
  }
  if (failure.isOutcomeUncertain) {
    return t(libraryAvailable ? 'create.uncertainLibrary' : 'create.uncertainSpotify')
  }
  return getApiErrorMessage(failure.error, t, fallbackKey)
}
