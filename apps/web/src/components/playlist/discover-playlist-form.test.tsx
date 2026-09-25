import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DiscoverPlaylistForm } from '@/components/playlist/discover-playlist-form'
import { renderPlaylistCoverBase64 } from '@/lib/playlist-cover'
import {
  jsonResponse,
  ndjsonResponse,
  renderWithProviders,
  setAuthState,
  stubApi,
  testUser,
} from '@/test/app-harness'
import { spotifyJazzPlaylist } from '@/test/playlist-fixtures'

vi.mock('@/lib/playlist-cover', () => ({
  renderPlaylistCoverBase64: vi.fn().mockResolvedValue('cover-data'),
}))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DiscoverPlaylistForm cover', () => {
  it('never builds the custom cover from the Spotify seed artwork', async () => {
    setAuthState(testUser)
    const { calls } = stubApi({
      'GET /api/artists/search': () =>
        jsonResponse({
          artists: [
            {
              id: 'artist-1',
              name: 'Sade',
              imageUrl: 'https://i.scdn.co/image/sade',
              externalUrl: 'https://open.spotify.com/artist/artist-1',
            },
          ],
        }),
      'POST /api/playlists/discover': () =>
        ndjsonResponse({ type: 'result', playlist: spotifyJazzPlaylist }),
      'GET /api/player/devices': () => jsonResponse({ devices: [] }),
    })
    const user = userEvent.setup()
    renderWithProviders(<DiscoverPlaylistForm />, { route: '/app/discover' })

    await user.type(screen.getByRole('combobox'), 'sade')
    await user.click(
      (await screen.findByRole('option', { name: 'Sade' })).firstElementChild!,
    )
    await user.click(screen.getByRole('button', { name: 'Create playlist' }))
    await screen.findByText('Playlist ready')

    expect(renderPlaylistCoverBase64).toHaveBeenCalledTimes(1)
    const [input] = vi.mocked(renderPlaylistCoverBase64).mock.calls[0]
    expect(input).toEqual({ title: expect.any(String), kind: 'discover' })
    expect(JSON.stringify(input)).not.toContain('i.scdn.co')
    const request = calls.find((call) => call.method === 'POST')
    expect(request?.body).toMatchObject({
      kind: 'discover_artist',
      coverImageBase64: 'cover-data',
    })
  })
})
