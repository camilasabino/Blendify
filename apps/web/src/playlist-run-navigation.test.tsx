import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import App from '@/App'
import {
  cleanSyncResult,
  emptyLibraryPage,
  spotifyJazzPlaylist,
} from '@/test/playlist-fixtures'
import {
  jsonResponse,
  pendingNdjsonResponse,
  renderWithProviders,
  setAuthState,
  stubApi,
  testUser,
  type FetchCall,
  type PendingNdjsonStream,
} from '@/test/app-harness'
import { usePlaylistRunStore } from '@/stores/playlist-run-store'

vi.mock('@/lib/playlist-cover', () => ({
  renderPlaylistCoverBase64: vi.fn().mockResolvedValue('cover-data'),
}))

const matchingProgress = {
  type: 'progress',
  phase: 'matching_tracks',
  current: 21,
  total: 50,
  percent: 42,
}

const spotifyDiscoverPlaylist = {
  ...spotifyJazzPlaylist,
  name: 'Blendify · Discover · Sade',
  kind: 'discover_artist',
  seeds: [{ type: 'artist', id: 'artist-1', name: 'Sade' }],
  generation: {
    version: 1,
    kind: 'discover_artist',
    targetTrackCount: 30,
    seed: { id: 'artist-1', name: 'Sade' },
    popularity: 'balanced',
    orderMode: 'random',
  },
}

function LocationProbe() {
  const location = useLocation()
  return <p data-testid="location">{location.pathname}</p>
}

function renderApp(route: string, options: { strict?: boolean } = {}) {
  return renderWithProviders(
    <>
      <App />
      <LocationProbe />
    </>,
    { route, ...options },
  )
}

function stubSpotifyApi(overrides: Parameters<typeof stubApi>[0] = {}) {
  const streams: PendingNdjsonStream[] = []
  const pendingStream = (_call: unknown, signal?: AbortSignal) => {
    const stream = pendingNdjsonResponse(signal)
    streams.push(stream)
    return stream.response
  }
  const api = stubApi({
    'GET /api/genres': () =>
      jsonResponse({ genres: [{ id: 'jazz', name: 'Jazz' }] }),
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
    'POST /api/playlists/mix': pendingStream,
    'POST /api/playlists/discover': pendingStream,
    'GET /api/playlists': () => jsonResponse(emptyLibraryPage),
    'POST /api/playlists/sync': () => jsonResponse(cleanSyncResult),
    'GET /api/player/devices': () => jsonResponse({ devices: [] }),
    ...overrides,
  })
  return { ...api, streams }
}

function generationCalls(calls: FetchCall[]) {
  return calls.filter(
    (call) =>
      call.method === 'POST' &&
      (call.url === '/api/playlists/mix' ||
        call.url === '/api/playlists/discover'),
  )
}

async function startJazzMix(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('radio', { name: 'Genres' }))
  await user.click(await screen.findByRole('button', { name: /Jazz/ }))
  await user.click(screen.getByRole('button', { name: 'Create playlist' }))
  await screen.findByText('Creating your playlist')
}

async function startSadeDiscover(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByRole('combobox'), 'sade')
  await user.click(
    (await screen.findByRole('option', { name: 'Sade' })).firstElementChild!,
  )
  await user.click(screen.getByRole('button', { name: 'Create playlist' }))
  await screen.findByText('Creating your playlist')
}

async function goTo(user: ReturnType<typeof userEvent.setup>, name: string) {
  const nav = screen.getAllByRole('navigation', { name: 'Main menu' })[0]
  await user.click(within(nav).getByRole('link', { name }))
}

function statusRegion() {
  return screen.getByRole('region', { name: 'Playlist creation' })
}

beforeEach(() => {
  setAuthState(testUser)
})

afterEach(() => {
  usePlaylistRunStore.getState().discard()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Spotify Mix generation across navigation', () => {
  it('stays visible in the shell, finishes once, and is restored when returning to Mix', async () => {
    const user = userEvent.setup()
    const { calls, streams } = stubSpotifyApi()
    const { queryClient } = renderApp('/app/mix')
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await startJazzMix(user)
    streams[0].push(matchingProgress)
    await screen.findByText('42%')

    await goTo(user, 'Library')
    await screen.findByRole('heading', { name: 'Your Library' })

    const region = statusRegion()
    expect(within(region).getByText('Creating your Mix')).toBeVisible()
    expect(within(region).getByText(/Finding songs/)).toBeVisible()
    expect(within(region).getByText(/42%/)).toBeVisible()
    expect(
      within(region).getByRole('link', { name: 'View progress' }),
    ).toHaveAttribute('href', '/app/mix')
    expect(generationCalls(calls)).toHaveLength(1)

    streams[0].push({ type: 'result', playlist: spotifyJazzPlaylist })
    streams[0].close()

    expect(await within(statusRegion()).findByText('Your Mix is ready')).toBeVisible()
    expect(invalidate).toHaveBeenCalledTimes(2)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['usage-stats'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['playlists'] })

    await user.click(
      within(statusRegion()).getByRole('link', { name: 'View playlist' }),
    )
    expect(screen.getByTestId('location')).toHaveTextContent('/app/mix')
    expect(
      await screen.findByRole('heading', { name: 'Blendify · Mix · Jazz' }),
    ).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Playlist creation' })).toBeNull()

    await goTo(user, 'Library')
    await goTo(user, 'Mix')

    expect(
      await screen.findByRole('heading', { name: 'Blendify · Mix · Jazz' }),
    ).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Playlist creation' })).toBeNull()
    expect(invalidate).toHaveBeenCalledTimes(2)
    expect(generationCalls(calls)).toHaveLength(1)
  })

  it('restores progress and blocks a second submit when returning before completion', async () => {
    const user = userEvent.setup()
    const { calls, streams } = stubSpotifyApi()
    renderApp('/app/mix')

    await startJazzMix(user)
    streams[0].push(matchingProgress)
    await goTo(user, 'Stats')
    await goTo(user, 'Mix')

    expect(await screen.findByText('Creating your playlist')).toBeVisible()
    expect(await screen.findByText('42%')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Creating…', hidden: true }),
    ).toBeDisabled()
    expect(screen.queryByRole('region', { name: 'Playlist creation' })).toBeNull()
    expect(generationCalls(calls)).toHaveLength(1)

    streams[0].push({ type: 'result', playlist: spotifyJazzPlaylist })
    streams[0].close()
    expect(
      await screen.findByRole('heading', { name: 'Blendify · Mix · Jazz' }),
    ).toBeVisible()
  })

  it('shows a failure raised after navigating away and retries from the stored request', async () => {
    const user = userEvent.setup()
    const { calls, streams } = stubSpotifyApi()
    renderApp('/app/mix')

    await startJazzMix(user)
    await goTo(user, 'Library')
    streams[0].push({
      type: 'error',
      statusCode: 502,
      code: 'CATALOG_UNAVAILABLE',
      message: 'Catalog unavailable',
    })
    streams[0].close()

    expect(
      await within(statusRegion()).findByText('Couldn’t create your Mix'),
    ).toBeVisible()

    await user.click(
      within(statusRegion()).getByRole('link', { name: 'View details' }),
    )
    expect(
      await screen.findByText('Couldn’t create the playlist'),
    ).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Playlist creation' })).toBeNull()
    expect(generationCalls(calls)).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(generationCalls(calls)).toHaveLength(2))
    expect(generationCalls(calls)[1].body).toEqual(generationCalls(calls)[0].body)
  })

  it('announces a terminal outcome once and does not replay it on remount', async () => {
    const user = userEvent.setup()
    const { streams } = stubSpotifyApi()
    renderApp('/app/mix')

    await startJazzMix(user)
    await goTo(user, 'Library')
    streams[0].push({ type: 'result', playlist: spotifyJazzPlaylist })
    streams[0].close()
    await within(statusRegion()).findByText('Your Mix is ready')

    await goTo(user, 'Mix')
    await goTo(user, 'Stats')
    await goTo(user, 'Mix')
    await goTo(user, 'Library')

    expect(screen.queryByRole('region', { name: 'Playlist creation' })).toBeNull()
    expect(screen.queryByText('Your Mix is ready')).toBeNull()
  })
})

describe('Spotify generation lifecycle boundaries', () => {
  it('keeps the same single run under React StrictMode double mounting', async () => {
    const user = userEvent.setup()
    const { calls, streams } = stubSpotifyApi()
    renderApp('/app/mix', { strict: true })

    await startJazzMix(user)
    await goTo(user, 'Library')
    expect(
      within(statusRegion()).getByText('Creating your Mix'),
    ).toBeVisible()

    streams[0].push({ type: 'result', playlist: spotifyJazzPlaylist })
    streams[0].close()
    await within(statusRegion()).findByText('Your Mix is ready')
    await goTo(user, 'Mix')

    expect(
      await screen.findByRole('heading', { name: 'Blendify · Mix · Jazz' }),
    ).toBeVisible()
    expect(generationCalls(calls)).toHaveLength(1)
  })

  it('aborts the run and clears the shell status when the account is deleted', async () => {
    const user = userEvent.setup()
    const { streams } = stubSpotifyApi({
      'DELETE /api/account': () => jsonResponse({ ok: true }),
    })
    renderApp('/app/mix')

    await startJazzMix(user)
    await goTo(user, 'Library')
    expect(
      await screen.findByRole('region', { name: 'Playlist creation' }),
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Account menu: Camila' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete account' }))
    await user.click(await screen.findByRole('button', { name: 'Delete my account' }))

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Playlist creation' })).toBeNull(),
    )
    expect(streams[0].signal?.aborted).toBe(true)
    expect(usePlaylistRunStore.getState().run).toBeNull()
  })

  it('drops the run on logout so nothing survives into the next session', async () => {
    const user = userEvent.setup()
    const { streams } = stubSpotifyApi({
      'POST /api/auth/logout': () => jsonResponse({ ok: true }),
    })
    renderApp('/app/mix')

    await startJazzMix(user)
    await goTo(user, 'Discover')
    expect(
      await screen.findByRole('region', { name: 'Playlist creation' }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Account menu: Camila' }))
    await user.click(screen.getByRole('menuitem', { name: 'Log out' }))

    await screen.findByRole('link', { name: 'Try Blendify' })
    expect(streams[0].signal?.aborted).toBe(true)
    expect(usePlaylistRunStore.getState().run).toBeNull()
    expect(screen.queryByRole('region', { name: 'Playlist creation' })).toBeNull()
  })
})

describe('Spotify Discover generation across navigation', () => {
  it('stays visible in the shell and its result is restored on Discover', async () => {
    const user = userEvent.setup()
    const { calls, streams } = stubSpotifyApi()
    const { queryClient } = renderApp('/app/discover')
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await startSadeDiscover(user)
    streams[0].push(matchingProgress)
    await goTo(user, 'Library')

    expect(
      within(statusRegion()).getByText('Creating your Discover playlist'),
    ).toBeVisible()
    expect(
      within(statusRegion()).getByRole('link', { name: 'View progress' }),
    ).toHaveAttribute('href', '/app/discover')

    streams[0].push({ type: 'result', playlist: spotifyDiscoverPlaylist })
    streams[0].close()
    await within(statusRegion()).findByText('Your Discover playlist is ready')
    expect(invalidate).toHaveBeenCalledTimes(2)

    await goTo(user, 'Discover')
    expect(
      await screen.findByRole('heading', { name: 'Blendify · Discover · Sade' }),
    ).toBeVisible()
    expect(generationCalls(calls)).toHaveLength(1)
  })

  it('does not let another feature start or abort a run that is already active', async () => {
    const user = userEvent.setup()
    const { calls, streams } = stubSpotifyApi()
    renderApp('/app/mix')

    await startJazzMix(user)
    await goTo(user, 'Discover')

    await user.type(await screen.findByRole('combobox'), 'sade')
    await user.click(
      (await screen.findByRole('option', { name: 'Sade' })).firstElementChild!,
    )
    expect(screen.getByRole('button', { name: 'Create playlist' })).toBeDisabled()
    expect(
      screen.getByText('Wait for your Mix to finish before creating another playlist.'),
    ).toBeVisible()
    expect(streams[0].signal?.aborted).toBe(false)
    expect(generationCalls(calls)).toHaveLength(1)
  })
})

describe('Guest generation across navigation', () => {
  it('is discarded when leaving the page instead of surviving in the shell', async () => {
    setAuthState(null)
    const user = userEvent.setup()
    const { streams } = stubSpotifyApi({
      'POST /api/generate/mix': (_call, signal) => {
        const stream = pendingNdjsonResponse(signal)
        streams.push(stream)
        return stream.response
      },
    })
    renderApp('/app/mix')

    await user.click(await screen.findByRole('radio', { name: 'Genres' }))
    await user.click(await screen.findByRole('button', { name: /Jazz/ }))
    await user.click(screen.getByRole('button', { name: 'Generate playlist' }))
    await screen.findByText('Generating your playlist')

    await goTo(user, 'Discover')

    expect(screen.queryByRole('region', { name: 'Playlist creation' })).toBeNull()
    expect(streams[0].signal?.aborted).toBe(true)

    await goTo(user, 'Mix')
    expect(screen.queryByText('Generating your playlist')).toBeNull()
    expect(screen.getByRole('button', { name: 'Generate playlist' })).toBeInTheDocument()
  })
})
