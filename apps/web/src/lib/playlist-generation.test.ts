import type { GenerateDiscoverRequest, GenerateMixRequest } from '@/lib/api'
import { api } from '@/lib/api'
import { runDiscoverGeneration, runMixGeneration } from '@/lib/playlist-generation'
import {
  guestJazzPlaylist as guestPlaylist,
  spotifyJazzPlaylist as spotifyPlaylist,
} from '@/test/playlist-fixtures'

const discoverRequest: GenerateDiscoverRequest = {
  kind: 'discover_artist',
  artistId: 'artist-1',
  targetTrackCount: 30,
  popularity: 'balanced',
  orderMode: 'random',
}

const publication = { coverImageBase64: 'cover-data', persistToLibrary: false }


afterEach(() => vi.restoreAllMocks())

describe('runDiscoverGeneration', () => {
  it('uses Guest generation without publication fields', async () => {
    const generate = vi
      .spyOn(api, 'generateDiscover')
      .mockResolvedValue(guestPlaylist)
    const create = vi.spyOn(api, 'createDiscover')

    const outcome = await runDiscoverGeneration({
      mode: 'guest',
      request: discoverRequest,
      publication,
    })

    expect(outcome).toEqual({ mode: 'guest', playlist: guestPlaylist })
    expect(generate).toHaveBeenCalledWith(discoverRequest, {
      onProgress: undefined,
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('uses Spotify creation with publication fields', async () => {
    const create = vi
      .spyOn(api, 'createDiscover')
      .mockResolvedValue(spotifyPlaylist)
    const generate = vi.spyOn(api, 'generateDiscover')

    const outcome = await runDiscoverGeneration({
      mode: 'spotify',
      request: discoverRequest,
      publication,
    })

    expect(outcome).toEqual({ mode: 'spotify', playlist: spotifyPlaylist })
    expect(create).toHaveBeenCalledWith(
      { ...discoverRequest, ...publication },
      { onProgress: undefined },
    )
    expect(generate).not.toHaveBeenCalled()
  })
})

describe('runMixGeneration', () => {
  it('chooses the endpoint from the submitted mode', async () => {
    const generate = vi.spyOn(api, 'generateMix').mockResolvedValue(guestPlaylist)
    const create = vi.spyOn(api, 'createMix').mockResolvedValue(spotifyPlaylist)
    const request: GenerateMixRequest = {
      kind: 'genre_mix',
      genreIds: ['jazz'],
      tracksPerSeed: 5,
      popularity: 'balanced',
      orderMode: 'random',
    }

    await runMixGeneration({ mode: 'guest', request, publication })
    await runMixGeneration({ mode: 'spotify', request, publication })

    expect(generate).toHaveBeenCalledWith(request, { onProgress: undefined })
    expect(create).toHaveBeenCalledWith(
      { ...request, ...publication },
      { onProgress: undefined },
    )
  })
})
