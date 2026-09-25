import { deriveCapabilities } from '@/lib/capabilities'

const user = {
  id: 'user-1',
  displayName: 'Camila',
  email: null,
  imageUrl: null,
}

describe('deriveCapabilities', () => {
  it('describes Guest Mode without a Spotify session', () => {
    expect(deriveCapabilities({ user: null, isInitialized: true })).toEqual({
      mode: 'guest',
      isResolved: true,
      canGenerate: true,
      canPublishToSpotify: false,
      canUseLibrary: false,
      canUseStats: false,
      canUsePlayback: false,
    })
  })

  it('describes Spotify Mode with a Spotify session', () => {
    expect(deriveCapabilities({ user, isInitialized: true })).toMatchObject({
      mode: 'spotify',
      canGenerate: true,
      canPublishToSpotify: true,
      canUseLibrary: true,
      canUseStats: true,
      canUsePlayback: true,
    })
  })

  it('reports an unresolved session while the auth probe runs', () => {
    expect(
      deriveCapabilities({ user: null, isInitialized: false }).isResolved,
    ).toBe(false)
  })
})
