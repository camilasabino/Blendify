import type { GeneratedPlaylistDto, GenerationProgress } from '@blendify/contracts'
import type { MessageKey } from '@/i18n/messages'
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
