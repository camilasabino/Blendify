import type { User } from '@/lib/api'

export type AppMode = 'guest' | 'spotify'

export type AppCapabilities = {
  mode: AppMode
  isResolved: boolean
  canGenerate: true
  canPublishToSpotify: boolean
  canUseLibrary: boolean
  canUseStats: boolean
  canUsePlayback: boolean
}

export type SpotifyOnlyCapability = 'canUseLibrary' | 'canUseStats'

export function deriveCapabilities(state: {
  user: User | null
  isInitialized: boolean
}): AppCapabilities {
  const hasSpotifySession = state.user !== null
  return {
    mode: hasSpotifySession ? 'spotify' : 'guest',
    isResolved: state.isInitialized,
    canGenerate: true,
    canPublishToSpotify: hasSpotifySession,
    canUseLibrary: hasSpotifySession,
    canUseStats: hasSpotifySession,
    canUsePlayback: hasSpotifySession,
  }
}
