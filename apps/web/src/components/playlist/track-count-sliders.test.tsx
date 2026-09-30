import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DiscoverPlaylistForm } from '@/components/playlist/discover-playlist-form'
import { MixPlaylistForm } from '@/components/playlist/mix-playlist-form'
import { useLocaleStore } from '@/i18n/use-locale'
import { usePlaylistRunStore } from '@/stores/playlist-run-store'
import { renderPlaylistCoverBase64 } from '@/lib/playlist-cover'
import {
  jsonResponse,
  ndjsonResponse,
  pendingNdjsonResponse,
  renderWithProviders,
  setAuthState,
  stubApi,
  testUser,
  type PendingNdjsonStream,
} from '@/test/app-harness'
import {
  guestJazzPlaylist,
  spotifyJazzPlaylist,
} from '@/test/playlist-fixtures'

vi.mock('@/lib/playlist-cover', () => ({
  renderPlaylistCoverBase64: vi.fn().mockResolvedValue('cover-data'),
}))

const genres = [
  { id: 'jazz', name: 'Jazz' },
  { id: 'soul', name: 'Soul' },
  { id: 'rock', name: 'Rock' },
  { id: 'pop', name: 'Pop' },
  { id: 'blues', name: 'Blues' },
]

const sade = {
  id: 'sade',
  name: 'Sade',
  imageUrl: 'https://i.scdn.co/image/sade',
  externalUrl: 'https://open.spotify.com/artist/sade',
}

const portishead = {
  id: 'portishead',
  name: 'Portishead',
  imageUrl: 'https://i.scdn.co/image/portishead',
  externalUrl: 'https://open.spotify.com/artist/portishead',
}

const stay = {
  id: 'stay',
  name: 'Stay',
  artistId: 'sade',
  artistName: 'Sade',
  albumImageUrl: 'https://i.scdn.co/image/stay',
  durationMs: 180_000,
  popularity: 40,
  uri: 'spotify:track:stay',
}

function setSlider(name: string, value: number) {
  fireEvent.change(screen.getByRole('slider', { name }), {
    target: { value: String(value) },
  })
}

function slider(name: string) {
  return screen.getByRole('slider', { name })
}

beforeEach(() => {
  usePlaylistRunStore.getState().discard()
  useLocaleStore.getState().setLocale('en')
})

afterEach(() => {
  vi.unstubAllGlobals()
  usePlaylistRunStore.getState().discard()
})

describe('Mix track-count slider', () => {
  it('shows per-source units, defaults, and an empty-selection range of 50', () => {
    setAuthState(null)
    stubApi({})
    renderWithProviders(<MixPlaylistForm />)

    const artists = slider('Songs per artist')
    expect(artists).toHaveValue('10')
    expect(artists).toHaveAttribute('min', '1')
    expect(artists).toHaveAttribute('max', '50')
    expect(artists).toHaveAttribute('step', '1')
    expect(artists).toHaveAccessibleDescription('Up to 50 with this selection')
    expect(screen.getByText('10 songs')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Generate playlist' }),
    ).toBeDisabled()
  })

  it('clamps when a source is added, keeps the value when the maximum grows, and sends the clamped count', async () => {
    setAuthState(null)
    const { calls } = stubApi({
      'GET /api/artists/similar': () =>
        jsonResponse({ artists: [], hasMore: false }),
      'POST /api/artists/resolve': () =>
        jsonResponse({ artists: [sade, portishead] }),
      'POST /api/generate/mix': () =>
        ndjsonResponse({ type: 'result', playlist: guestJazzPlaylist }),
    })
    const user = userEvent.setup()
    renderWithProviders(<MixPlaylistForm />)

    setSlider('Songs per artist', 40)
    expect(slider('Songs per artist')).toHaveValue('40')
    expect(renderPlaylistCoverBase64).not.toHaveBeenCalled()
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Paste a list of artists' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Paste a list of artists' }),
      'Sade\nPortishead',
    )
    await user.click(screen.getByRole('button', { name: 'Add artists' }))

    expect(await screen.findByText('Up to 25 with this selection')).toBeVisible()
    expect(slider('Songs per artist')).toHaveValue('25')
    expect(screen.getByText('≈ 50 songs · 25 songs per artist')).toBeVisible()
    expect(screen.getByText('Adjusted to 25 songs')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove Portishead' }))

    expect(slider('Songs per artist')).toHaveValue('25')
    expect(slider('Songs per artist')).toHaveAttribute('max', '50')
    expect(screen.getByText('Up to 50 with this selection')).toBeVisible()
    expect(screen.getByText('≈ 25 songs · 25 songs per artist')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Generate playlist' }))
    await screen.findByRole('heading', { name: 'Blendify · Mix · Jazz' })

    const request = calls.find((call) => call.url === '/api/generate/mix')
    expect(request?.body).toMatchObject({
      kind: 'artist_mix',
      tracksPerSeed: 25,
      artistIds: ['sade'],
    })
    expect(request?.body).not.toHaveProperty('coverImageBase64')
  })

  it('uses the singular unit when the count is 1', async () => {
    setAuthState(null)
    stubApi({
      'GET /api/artists/similar': () =>
        jsonResponse({ artists: [], hasMore: false }),
      'POST /api/artists/resolve': () => jsonResponse({ artists: [sade] }),
    })
    const user = userEvent.setup()
    renderWithProviders(<MixPlaylistForm />)

    setSlider('Songs per artist', 1)
    await user.click(screen.getByRole('button', { name: 'Paste a list of artists' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Paste a list of artists' }),
      'Sade',
    )
    await user.click(screen.getByRole('button', { name: 'Add artists' }))

    expect(await screen.findByText('≈ 1 song · 1 song per artist')).toBeVisible()
    expect(screen.getByText('1 song')).toBeVisible()
  })

  it('clamps genres, keeps an independent artist count, and does not let the hidden field block submit', async () => {
    setAuthState(null)
    const { calls } = stubApi({
      'GET /api/genres': () => jsonResponse({ genres }),
      'GET /api/genres/explore': () => jsonResponse({ genres: [], hasMore: false }),
      'GET /api/artists/similar': () =>
        jsonResponse({ artists: [], hasMore: false }),
      'POST /api/artists/resolve': () => jsonResponse({ artists: [sade] }),
      'POST /api/generate/mix': () =>
        ndjsonResponse({ type: 'result', playlist: guestJazzPlaylist }),
    })
    const user = userEvent.setup()
    renderWithProviders(<MixPlaylistForm />)

    setSlider('Songs per artist', 18)
    await user.click(screen.getByRole('radio', { name: 'Genres' }))

    const genresSlider = slider('Songs per genre')
    expect(genresSlider).toHaveValue('25')
    expect(screen.queryByRole('slider', { name: 'Songs per artist' })).toBeNull()

    for (const genre of genres) {
      await user.click(screen.getByRole('button', { name: genre.name }))
    }

    expect(slider('Songs per genre')).toHaveValue('10')
    expect(slider('Songs per genre')).toHaveAttribute('max', '10')
    expect(screen.getByText('Up to 10 with this selection')).toBeVisible()
    expect(screen.getByText('≈ 50 songs · 10 songs per genre')).toBeVisible()

    await user.click(screen.getByRole('radio', { name: 'Artists' }))
    expect(slider('Songs per artist')).toHaveValue('18')

    await user.click(screen.getByRole('button', { name: 'Paste a list of artists' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Paste a list of artists' }),
      'Sade',
    )
    await user.click(screen.getByRole('button', { name: 'Add artists' }))
    expect(await screen.findByRole('button', { name: 'Remove Sade' })).toBeVisible()

    setSlider('Songs per artist', 20)
    await user.click(screen.getByRole('button', { name: 'Generate playlist' }))
    await screen.findByRole('heading', { name: 'Blendify · Mix · Jazz' })

    expect(calls.find((call) => call.method === 'POST' && call.url === '/api/generate/mix')?.body).toMatchObject({
      kind: 'artist_mix',
      tracksPerSeed: 20,
      artistIds: ['sade'],
    })
  })

  it('resets to the defaults and disables the slider while generating', async () => {
    setAuthState(null)
    const streams: PendingNdjsonStream[] = []
    stubApi({
      'GET /api/genres': () => jsonResponse({ genres: [genres[0]] }),
      'POST /api/generate/mix': (_call, signal) => {
        const stream = pendingNdjsonResponse(signal)
        streams.push(stream)
        return stream.response
      },
    })
    const user = userEvent.setup()
    renderWithProviders(<MixPlaylistForm />)

    await user.click(screen.getByRole('radio', { name: 'Genres' }))
    setSlider('Songs per genre', 12)
    await user.click(await screen.findByRole('button', { name: 'Jazz' }))
    await user.click(screen.getByRole('button', { name: 'Generate playlist' }))

    await waitFor(() => expect(streams).toHaveLength(1))
    expect(
      screen.getByRole('slider', { name: 'Songs per genre', hidden: true }),
    ).toBeDisabled()

    streams[0].push({ type: 'result', playlist: guestJazzPlaylist })
    streams[0].close()
    await screen.findByRole('heading', { name: 'Blendify · Mix · Jazz' })
    await user.click(screen.getByRole('button', { name: 'Try different settings' }))
    expect(slider('Songs per genre')).toHaveValue('12')

    await user.click(screen.getByRole('button', { name: 'Create another' }))
    expect(slider('Songs per artist')).toHaveValue('10')
    expect(slider('Songs per artist')).toHaveAttribute('max', '50')
  })

  it('keeps the previous run snapshot when the draft changes and retry resubmits it', async () => {
    setAuthState(null)
    const streams: PendingNdjsonStream[] = []
    const { calls } = stubApi({
      'GET /api/genres': () => jsonResponse({ genres: [genres[0]] }),
      'POST /api/generate/mix': (_call, signal) => {
        const stream = pendingNdjsonResponse(signal)
        streams.push(stream)
        return stream.response
      },
    })
    const user = userEvent.setup()
    renderWithProviders(<MixPlaylistForm />)

    await user.click(screen.getByRole('radio', { name: 'Genres' }))
    await user.click(await screen.findByRole('button', { name: 'Jazz' }))
    await user.click(screen.getByRole('button', { name: 'Generate playlist' }))
    await waitFor(() => expect(streams).toHaveLength(1))
    streams[0].push({
      type: 'error',
      statusCode: 502,
      code: 'CATALOG_UNAVAILABLE',
      message: 'Catalog unavailable',
    })
    streams[0].close()

    await screen.findByRole('button', { name: 'Try again' })
    setSlider('Songs per genre', 8)
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(streams).toHaveLength(2))

    const posts = calls.filter((call) => call.url === '/api/generate/mix')
    expect(posts).toHaveLength(2)
    expect(posts[0].body).toMatchObject({ tracksPerSeed: 25, genreIds: ['jazz'] })
    expect(posts[1].body).toEqual(posts[0].body)

    streams[1].push({ type: 'result', playlist: guestJazzPlaylist })
    streams[1].close()
    await screen.findByRole('heading', { name: 'Blendify · Mix · Jazz' })
    await user.click(screen.getByRole('button', { name: 'Try different settings' }))
    setSlider('Songs per genre', 4)

    expect(
      screen.getByRole('button', { name: /Settings used/ }),
    ).toHaveTextContent('1 song')
    expect(screen.getByRole('heading', { name: 'Blendify · Mix · Jazz' })).toBeVisible()
  })

  it('sends the same per-source count in Guest and Spotify mode', async () => {
    const { calls } = stubApi({
      'GET /api/genres': () => jsonResponse({ genres: [genres[0]] }),
      'POST /api/generate/mix': () =>
        ndjsonResponse({ type: 'result', playlist: guestJazzPlaylist }),
      'POST /api/playlists/mix': () =>
        ndjsonResponse({ type: 'result', playlist: spotifyJazzPlaylist }),
      'GET /api/player/devices': () => jsonResponse({ devices: [] }),
    })
    const user = userEvent.setup()

    setAuthState(null)
    const guest = renderWithProviders(<MixPlaylistForm />)
    await user.click(screen.getByRole('radio', { name: 'Genres' }))
    setSlider('Songs per genre', 12)
    await user.click(await screen.findByRole('button', { name: 'Jazz' }))
    await user.click(screen.getByRole('button', { name: 'Generate playlist' }))
    await screen.findByRole('heading', { name: 'Blendify · Mix · Jazz' })
    guest.unmount()

    setAuthState(testUser)
    renderWithProviders(<MixPlaylistForm />)
    await user.click(screen.getByRole('radio', { name: 'Genres' }))
    setSlider('Songs per genre', 12)
    await user.click(await screen.findByRole('button', { name: 'Jazz' }))
    expect(screen.getByRole('heading', { name: 'Size and cover' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Create playlist' }))
    await screen.findByText('Playlist ready')

    const posts = calls.filter((call) => call.method === 'POST')
    expect(posts[0].url).toBe('/api/generate/mix')
    expect(posts[0].body).toMatchObject({ tracksPerSeed: 12 })
    expect(posts[0].body).not.toHaveProperty('persistToLibrary')
    expect(posts[1].url).toBe('/api/playlists/mix')
    expect(posts[1].body).toMatchObject({
      tracksPerSeed: 12,
      persistToLibrary: true,
      coverImageBase64: 'cover-data',
    })
  })

  it.each([
    ['es', 'Canciones por artista', '10 canciones', 'Hasta 50 con esta selección'],
    ['pt', 'Músicas por artista', '10 músicas', 'Até 50 com esta seleção'],
  ] as const)(
    'localizes the artist slider in %s',
    (locale, label, value, hint) => {
      setAuthState(null)
      stubApi({})
      renderWithProviders(<MixPlaylistForm />)
      act(() => {
        useLocaleStore.getState().setLocale(locale)
      })

      const control = slider(label)
      expect(control).toHaveValue('10')
      expect(control).toHaveAccessibleDescription(hint)
      expect(screen.getByText(value)).toBeVisible()
    },
  )
})

describe('Discover track-count slider', () => {
  it('accepts any integer from 15 to 50 and submits it for an artist and a song', async () => {
    setAuthState(null)
    const { calls } = stubApi({
      'GET /api/artists/search': () => jsonResponse({ artists: [sade] }),
      'GET /api/tracks/search': () => jsonResponse({ tracks: [stay] }),
      'POST /api/generate/discover': () =>
        ndjsonResponse({ type: 'result', playlist: guestJazzPlaylist }),
    })
    const user = userEvent.setup()
    renderWithProviders(<DiscoverPlaylistForm />, { route: '/app/discover' })

    const count = slider('Playlist size')
    expect(count).toHaveValue('10')
    expect(count).toHaveAttribute('min', '1')
    expect(count).toHaveAttribute('max', '50')
    expect(count).toHaveAttribute('step', '1')
    expect(count).toHaveAttribute('aria-valuetext', '10 songs')

    setSlider('Playlist size', 23)
    expect(slider('Playlist size')).toHaveValue('23')
    expect(screen.getByText('23 songs')).toBeVisible()
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0)

    await user.type(screen.getByRole('combobox', { name: 'Artist' }), 'sade')
    await user.click(
      (await screen.findByRole('option', { name: 'Sade' }, { timeout: 3_000 }))
        .firstElementChild!,
    )
    expect(screen.getByText('≈ 23 songs · based on Sade')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Generate playlist' }))
    await screen.findByRole('heading', { name: 'Blendify · Mix · Jazz' })

    await user.click(screen.getByRole('button', { name: 'Try different settings' }))
    expect(slider('Playlist size')).toHaveValue('23')
    await user.click(screen.getByRole('radio', { name: 'Song' }))
    expect(slider('Playlist size')).toHaveValue('23')
    setSlider('Playlist size', 31)

    await user.type(screen.getByRole('combobox', { name: 'Song' }), 'stay')
    await user.click(
      (
        await screen.findByRole('option', { name: /Stay/ }, { timeout: 3_000 })
      ).firstElementChild!,
    )
    await user.click(screen.getByRole('button', { name: 'Generate playlist' }))

    const posts = calls.filter((call) => call.url === '/api/generate/discover')
    expect(posts.map((call) => call.body)).toMatchObject([
      { kind: 'discover_artist', targetTrackCount: 23 },
      { kind: 'discover_track', targetTrackCount: 31 },
    ])
  })

  it('localizes the playlist-size slider', () => {
    setAuthState(null)
    stubApi({})
    renderWithProviders(<DiscoverPlaylistForm />, { route: '/app/discover' })
    act(() => {
      useLocaleStore.getState().setLocale('es')
    })

    expect(slider('Tamaño de la playlist')).toHaveAttribute(
      'aria-valuetext',
      '10 canciones',
    )
    expect(screen.getByText('10 canciones')).toBeVisible()
  })

  it('submits the default of 10 and restores it on create another', async () => {
    setAuthState(null)
    const { calls } = stubApi({
      'GET /api/artists/search': () => jsonResponse({ artists: [sade] }),
      'POST /api/generate/discover': () =>
        ndjsonResponse({ type: 'result', playlist: guestJazzPlaylist }),
    })
    const user = userEvent.setup()
    renderWithProviders(<DiscoverPlaylistForm />, { route: '/app/discover' })

    expect(slider('Playlist size')).toHaveValue('10')
    await user.type(screen.getByRole('combobox', { name: 'Artist' }), 'sade')
    await user.click(
      (await screen.findByRole('option', { name: 'Sade' }, { timeout: 3_000 }))
        .firstElementChild!,
    )
    expect(screen.getByText('≈ 10 songs · based on Sade')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Generate playlist' }))
    await screen.findByRole('heading', { name: 'Blendify · Mix · Jazz' })

    await user.click(screen.getByRole('button', { name: 'Create another' }))
    expect(slider('Playlist size')).toHaveValue('10')

    const posts = calls.filter((call) => call.url === '/api/generate/discover')
    expect(posts).toHaveLength(1)
    expect(posts[0].body).toMatchObject({
      kind: 'discover_artist',
      targetTrackCount: 10,
    })
  })

  it('uses the singular estimate when the playlist size is 1', async () => {
    setAuthState(null)
    stubApi({
      'GET /api/artists/search': () => jsonResponse({ artists: [sade] }),
    })
    const user = userEvent.setup()
    renderWithProviders(<DiscoverPlaylistForm />, { route: '/app/discover' })

    setSlider('Playlist size', 1)
    expect(screen.getByText('1 song')).toBeVisible()
    await user.type(screen.getByRole('combobox', { name: 'Artist' }), 'sade')
    await user.click(
      (await screen.findByRole('option', { name: 'Sade' }, { timeout: 3_000 }))
        .firstElementChild!,
    )
    expect(screen.getByText('≈ 1 song · based on Sade')).toBeVisible()
  })

  it('retries the explicit count from the run snapshot', async () => {
    setAuthState(null)
    const streams: PendingNdjsonStream[] = []
    const { calls } = stubApi({
      'GET /api/artists/search': () => jsonResponse({ artists: [sade] }),
      'POST /api/generate/discover': (_call, signal) => {
        const stream = pendingNdjsonResponse(signal)
        streams.push(stream)
        return stream.response
      },
    })
    const user = userEvent.setup()
    renderWithProviders(<DiscoverPlaylistForm />, { route: '/app/discover' })

    setSlider('Playlist size', 30)
    await user.type(screen.getByRole('combobox', { name: 'Artist' }), 'sade')
    await user.click(
      (await screen.findByRole('option', { name: 'Sade' }, { timeout: 3_000 }))
        .firstElementChild!,
    )
    await user.click(screen.getByRole('button', { name: 'Generate playlist' }))
    await waitFor(() => expect(streams).toHaveLength(1))
    streams[0].push({
      type: 'error',
      statusCode: 502,
      code: 'CATALOG_UNAVAILABLE',
      message: 'Catalog unavailable',
    })
    streams[0].close()

    await screen.findByRole('button', { name: 'Try again' })
    setSlider('Playlist size', 10)
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(streams).toHaveLength(2))

    const posts = calls.filter((call) => call.url === '/api/generate/discover')
    expect(posts).toHaveLength(2)
    expect(posts[0].body).toMatchObject({
      kind: 'discover_artist',
      targetTrackCount: 30,
    })
    expect(posts[1].body).toEqual(posts[0].body)
  })
})
