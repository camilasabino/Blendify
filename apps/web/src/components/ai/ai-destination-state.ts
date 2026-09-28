import type { AiSessionDestinationDto } from '@blendify/contracts'

export type AiSpotifyDestination = Exclude<
  AiSessionDestinationDto,
  { status: 'transfer_prepared' }
>

export function isSpotifyDestination(
  destination: AiSessionDestinationDto | null,
): destination is AiSpotifyDestination {
  return destination !== null && destination.status !== 'transfer_prepared'
}
