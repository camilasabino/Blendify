export type SpotifyOnlyFeature = 'library' | 'stats'

export type SpotifyRequiredState = { spotifyRequired: SpotifyOnlyFeature }

export function readSpotifyRequiredState(
  state: unknown,
): SpotifyOnlyFeature | null {
  if (typeof state !== 'object' || state === null) return null
  if (!('spotifyRequired' in state)) return null
  const feature = state.spotifyRequired
  return feature === 'library' || feature === 'stats' ? feature : null
}
