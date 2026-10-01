import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DiscoverPlaylistForm } from '@/components/playlist/discover-playlist-form'
import { renderPlaylistCoverBase64 } from '@/lib/playlist-cover'
import { usePlaylistRunStore } from '@/stores/playlist-run-store'
import {
  jsonResponse,
  ndjsonResponse,
  renderWithProviders,
  setAuthState,
  stubApi,
  testUser,
} from '@/test/app-harness'
import {
  guestJazzPlaylist,
  spotifyJazzPlaylist,
} from '@/test/playlist-fixtures'

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

describe('DiscoverPlaylistForm after an unconfirmed Spotify creation', () => {
  beforeEach(() => {
    usePlaylistRunStore.getState().discard()
  })

  it('keeps the seed, blocks the usual submit and Enter, and creates again only on the explicit action', async () => {
    setAuthState(testUser)
    let creations = 0
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
      'POST /api/playlists/discover': () => {
        creations += 1
        return creations === 1
          ? ndjsonResponse({
              type: 'error',
              statusCode: 502,
              code: 'SPOTIFY_OUTCOME_UNKNOWN',
              message: 'Spotify did not confirm the result of this change.',
              details: { operation: 'createPlaylist', category: 'timeout', status: null },
            })
          : ndjsonResponse({ type: 'result', playlist: spotifyJazzPlaylist })
      },
      'GET /api/player/devices': () => jsonResponse({ devices: [] }),
    })
    const user = userEvent.setup()
    renderWithProviders(<DiscoverPlaylistForm />, { route: '/app/discover' })

    await user.type(screen.getByRole('combobox'), 'sade')
    await user.click(
      (await screen.findByRole('option', { name: 'Sade' })).firstElementChild!,
    )
    await user.click(screen.getByRole('button', { name: 'Create playlist' }))
    await screen.findByRole('heading', { name: 'Couldn’t confirm the playlist' })

    const submit = screen.getByRole('button', { name: 'Create playlist' })
    expect(submit).toBeDisabled()
    expect(screen.getByText('Sade')).toBeVisible()
    await user.click(screen.getByRole('radio', { name: 'Artist' }))
    await user.keyboard('{Enter}')
    fireEvent.submit(submit.closest('form')!)
    await new Promise((resolve) => setTimeout(resolve, 50))
    const posts = () => calls.filter((call) => call.method === 'POST')
    expect(posts()).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Create a new playlist anyway' }))
    await screen.findByText('Playlist ready')

    expect(posts()).toHaveLength(2)
    expect(posts()[1].body).toEqual(posts()[0].body)
  })
})

describe('DiscoverPlaylistForm region filter', () => {
  beforeEach(() => {
    usePlaylistRunStore.getState().discard()
  })

  const stay = {
    id: 'stay',
    name: 'Stay',
    artistId: 'sade',
    artistName: 'Sade',
    albumImageUrl: null,
    durationMs: 180_000,
    popularity: 40,
    uri: 'spotify:track:stay',
  }

  const regionalDiscovery = {
    ...guestJazzPlaylist,
    generation: {
      version: 1,
      kind: 'discover_artist',
      targetTrackCount: 10,
      seed: { id: 'artist-1', name: 'Sade' },
      filters: { region: 'argentina' },
      popularity: 'balanced',
      orderMode: 'random',
    },
  }

  it('refines discovered results by region for both artist and song seeds', async () => {
    setAuthState(null)
    const { calls } = stubApi({
      'GET /api/artists/search': () =>
        jsonResponse({ artists: [{ id: 'artist-1', name: 'Sade' }] }),
      'GET /api/tracks/search': () => jsonResponse({ tracks: [stay] }),
      'POST /api/generate/discover': () =>
        ndjsonResponse({ type: 'result', playlist: regionalDiscovery }),
    })
    const user = userEvent.setup()
    renderWithProviders(<DiscoverPlaylistForm />, { route: '/app/discover' })

    const section = screen
      .getByRole('heading', { name: 'Refine results' })
      .closest('section')!
    const region = screen.getByRole('button', { name: /Region/ })
    expect(section).toContainElement(region)
    expect(region).toHaveTextContent('Any region')
    expect(region).toHaveAccessibleDescription(
      'Optional · Limits results to a scene or region.',
    )
    await user.click(region)
    await user.click(await screen.findByRole('option', { name: 'Argentina' }))
    expect(region).toHaveTextContent('Argentina')

    await user.type(screen.getByRole('combobox', { name: 'Artist' }), 'sade')
    await user.click(
      (await screen.findByRole('option', { name: /Sade/ }, { timeout: 3_000 }))
        .firstElementChild!,
    )
    await user.click(screen.getByRole('button', { name: 'Generate playlist' }))
    await screen.findByRole('heading', { name: 'Blendify · Mix · Jazz' })
    expect(screen.getByText(/^Sade · Argentina · /)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try different settings' }))
    await user.click(screen.getByRole('radio', { name: 'Song' }))
    expect(screen.getByRole('button', { name: /Region/ })).toHaveTextContent(
      'Argentina',
    )
    await user.type(screen.getByRole('combobox', { name: 'Song' }), 'stay')
    await user.click(
      (await screen.findByRole('option', { name: /Stay/ }, { timeout: 3_000 }))
        .firstElementChild!,
    )
    await user.click(screen.getByRole('button', { name: 'Generate playlist' }))

    await vi.waitFor(() => {
      expect(
        calls.filter((call) => call.url === '/api/generate/discover'),
      ).toHaveLength(2)
    })
    const posts = calls.filter((call) => call.url === '/api/generate/discover')
    expect(posts.map((call) => call.body)).toMatchObject([
      {
        kind: 'discover_artist',
        artistId: 'artist-1',
        filters: { region: 'argentina' },
      },
      {
        kind: 'discover_track',
        trackId: 'stay',
        filters: { region: 'argentina' },
      },
    ])
  })

  it('offers every result filter in order and sends them canonically', async () => {
    setAuthState(null)
    const filtered = {
      ...regionalDiscovery,
      generation: {
        ...regionalDiscovery.generation,
        filters: {
          region: null,
          femaleVocals: true,
          releaseRange: { fromYear: 1990, toYear: 1999 },
          excludeLive: true,
        },
      },
    }
    const { calls } = stubApi({
      'GET /api/artists/search': () =>
        jsonResponse({ artists: [{ id: 'artist-1', name: 'Sade' }] }),
      'POST /api/generate/discover': () =>
        ndjsonResponse({ type: 'result', playlist: filtered }),
    })
    const user = userEvent.setup()
    renderWithProviders(<DiscoverPlaylistForm />, { route: '/app/discover' })

    const section = screen
      .getByRole('heading', { name: 'Refine results' })
      .closest('section')!
    const selects = within(section)
      .getAllByRole('button')
      .filter((control) => control.getAttribute('aria-haspopup') === 'listbox')
    expect(selects.map((control) => control.textContent)).toEqual([
      'Any region',
      'Any',
      'Any',
    ])
    const vocals = within(section).getByRole('button', { name: /Vocals/ })
    expect(vocals).toHaveAccessibleDescription(
      'Optional · Filters result artists by their vocals.',
    )
    await user.click(vocals)
    expect(
      await screen.findByRole('option', { name: 'Female vocals' }),
    ).toBeVisible()
    expect(screen.queryByRole('option', { name: /women/i })).toBeNull()
    await user.click(screen.getByRole('option', { name: 'Female vocals' }))
    await user.click(within(section).getByRole('button', { name: /Decade/ }))
    const decades = (await screen.findAllByRole('option')).map(
      (option) => option.textContent,
    )
    expect(decades).toEqual([
      'Any',
      '2020–2029',
      '2010–2019',
      '2000–2009',
      '1990–1999',
      '1980–1989',
      '1970–1979',
      '1960–1969',
      '1950–1959',
    ])
    await user.click(screen.getByRole('option', { name: '1990–1999' }))
    const live = within(section).getByRole('switch', {
      name: 'Exclude live versions',
    })
    expect(live).toHaveAccessibleDescription(
      'Skips recordings identified as live or unplugged.',
    )
    await user.click(live)
    expect(live).toHaveAttribute('aria-checked', 'true')

    await user.type(screen.getByRole('combobox', { name: 'Artist' }), 'sade')
    await user.click(
      (await screen.findByRole('option', { name: /Sade/ }, { timeout: 3_000 }))
        .firstElementChild!,
    )
    await user.click(screen.getByRole('button', { name: 'Generate playlist' }))
    await screen.findByRole('heading', { name: 'Blendify · Mix · Jazz' })

    const [post] = calls.filter((call) => call.url === '/api/generate/discover')
    expect(post.body).toMatchObject({
      kind: 'discover_artist',
      filters: {
        region: null,
        femaleVocals: true,
        releaseRange: { fromYear: 1990, toYear: 1999 },
        excludeLive: true,
      },
    })
    expect(
      screen.getByText(/^Sade · Female vocals · 1990–1999 · No live versions · /),
    ).toBeInTheDocument()
  })
})
