import { act, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MixPlaylistForm } from '@/components/playlist/mix-playlist-form'
import { messages } from '@/i18n/messages'
import { useLocaleStore } from '@/i18n/use-locale'
import { renderPlaylistCoverBase64 } from '@/lib/playlist-cover'
import { usePlaylistRunStore } from '@/stores/playlist-run-store'
import {
  jsonResponse,
  ndjsonResponse,
  renderWithProviders,
  setAuthState,
  stubApi,
  testUser,
  type FetchCall,
} from '@/test/app-harness'
import {
  guestJazzPlaylist as guestPlaylist,
  spotifyJazzPlaylist as spotifyPlaylist,
} from '@/test/playlist-fixtures'

vi.mock('@/lib/playlist-cover', () => ({
  renderPlaylistCoverBase64: vi.fn().mockResolvedValue('cover-data'),
}))

const progress = {
  type: 'progress',
  phase: 'matching_tracks',
  current: 1,
  total: 1,
  percent: 90,
}

function stubGeneration() {
  return stubApi({
    'GET /api/genres': () =>
      jsonResponse({ genres: [{ id: 'jazz', name: 'Jazz' }] }),
    'POST /api/generate/mix': () =>
      ndjsonResponse(progress, { type: 'result', playlist: guestPlaylist }),
    'POST /api/playlists/mix': () =>
      ndjsonResponse(progress, { type: 'result', playlist: spotifyPlaylist }),
    'GET /api/player/devices': () => jsonResponse({ devices: [] }),
  })
}

async function generateJazzMix(submitLabel: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('radio', { name: 'Genres' }))
  await user.click(await screen.findByRole('button', { name: /Jazz/ }))
  await user.click(screen.getByRole('button', { name: submitLabel }))
  return screen.findByRole('heading', { name: 'Blendify · Mix · Jazz' })
}

function generationCalls(calls: FetchCall[]) {
  return calls.filter((call) => call.method === 'POST')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MixPlaylistForm genre region', () => {
  afterEach(() => {
    useLocaleStore.getState().setLocale('en')
  })

  it('shows localized genre labels and submits canonical genre and region values', async () => {
    const es = messages.es
    setAuthState(null)
    const { calls } = stubApi({
      'GET /api/genres': () =>
        jsonResponse({
          genres: [
            {
              id: 'korean ballad',
              name: 'Korean Ballad',
            },
          ],
        }),
      'POST /api/generate/mix': () =>
        ndjsonResponse(progress, { type: 'result', playlist: guestPlaylist }),
    })
    renderWithProviders(<MixPlaylistForm />)
    act(() => useLocaleStore.getState().setLocale('es'))
    const user = userEvent.setup()

    await user.click(screen.getByRole('radio', { name: es['create.modeGenres'] }))
    const region = screen.getByRole('button', { name: new RegExp(es['create.region']) })
    expect(region).toHaveTextContent(es['create.regionAny'])
    await user.click(await screen.findByRole('button', { name: 'Balada coreana' }))
    await user.click(region)
    await user.click(await screen.findByRole('option', { name: es['region.brazilian'] }))
    await user.click(screen.getByRole('button', { name: es['create.generateGuest'] }))
    await vi.waitFor(() => {
      expect(generationCalls(calls)).toHaveLength(1)
    })
    expect(generationCalls(calls)[0].body).toMatchObject({
      kind: 'genre_mix',
      name: 'Blendify · Mezcla · Balada coreana · Brasil',
      genreIds: ['korean ballad'],
      filters: { region: 'brazilian' },
    })
  })

  it('shows only the decade and live controls for an artist mix', async () => {
    setAuthState(null)
    stubGeneration()
    renderWithProviders(<MixPlaylistForm />)

    const section = screen
      .getByRole('heading', { name: 'Refine results' })
      .closest('section')
    expect(section).not.toBeNull()
    expect(
      within(section!).getByRole('button', { name: /Decade/ }),
    ).toHaveAttribute('aria-haspopup', 'listbox')
    expect(
      within(section!).getByRole('switch', { name: 'Exclude live versions' }),
    ).toHaveAttribute('aria-checked', 'false')
    expect(
      within(section!).queryByRole('button', { name: /Region/ }),
    ).not.toBeInTheDocument()
    expect(
      within(section!).queryByRole('button', { name: /Vocals/ }),
    ).not.toBeInTheDocument()
    expect(within(section!).queryByText(/female/i)).not.toBeInTheDocument()
  })

  it('shows every filter in order under Refine results for genre mixes', async () => {
    setAuthState(null)
    stubGeneration()
    renderWithProviders(<MixPlaylistForm />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('radio', { name: 'Genres' }))

    const section = screen
      .getByRole('heading', { name: 'Refine results' })
      .closest('section')
    expect(section).not.toBeNull()
    const controls = within(section!)
      .getAllByRole('button')
      .map((control) => control.getAttribute('aria-haspopup') === 'listbox' ? control.textContent : null)
      .filter(Boolean)
    expect(controls).toEqual(['Any region', 'Any', 'Any'])
    expect(
      within(section!).getByRole('button', { name: /Region/ }),
    ).toHaveAttribute('aria-haspopup', 'listbox')
    expect(within(section!).getByRole('button', { name: /Vocals/ })).toBeVisible()
    expect(within(section!).getByRole('button', { name: /Decade/ })).toBeVisible()
    expect(
      within(section!).getByRole('switch', { name: 'Exclude live versions' }),
    ).toBeVisible()
    const source = screen
      .getByRole('heading', { name: 'Artists or genres' })
      .closest('section')
    expect(
      within(source!).queryByRole('button', { name: /Region/ }),
    ).not.toBeInTheDocument()
  })

  it('sends every selected genre mix filter canonically', async () => {
    setAuthState(null)
    const { calls } = stubApi({
      'GET /api/genres': () =>
        jsonResponse({ genres: [{ id: 'rock', name: 'Rock' }] }),
      'POST /api/generate/mix': () =>
        ndjsonResponse(progress, { type: 'result', playlist: guestPlaylist }),
    })
    renderWithProviders(<MixPlaylistForm />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('radio', { name: 'Genres' }))
    await user.click(await screen.findByRole('button', { name: 'Rock' }))
    await user.click(screen.getByRole('button', { name: /Region/ }))
    await user.click(await screen.findByRole('option', { name: 'Argentina' }))
    await user.click(screen.getByRole('button', { name: /Vocals/ }))
    await user.click(await screen.findByRole('option', { name: 'Female vocals' }))
    await user.click(screen.getByRole('button', { name: /Decade/ }))
    await user.click(await screen.findByRole('option', { name: '1990–1999' }))
    await user.click(screen.getByRole('switch', { name: 'Exclude live versions' }))
    await user.click(screen.getByRole('button', { name: 'Generate playlist' }))

    await vi.waitFor(() => {
      expect(generationCalls(calls)).toHaveLength(1)
    })
    const [request] = generationCalls(calls)
    expect(request.body).toMatchObject({
      kind: 'genre_mix',
      name: 'Blendify · Mix · Rock · Argentina',
      filters: {
        region: 'argentina',
        femaleVocals: true,
        releaseRange: { fromYear: 1990, toYear: 1999 },
        excludeLive: true,
      },
    })
    expect(request.body).not.toHaveProperty('decade')
  })

  it('never sends artist-level filters chosen for genres with an artist mix', async () => {
    setAuthState(null)
    const { calls } = stubApi({
      'GET /api/genres': () =>
        jsonResponse({ genres: [{ id: 'jazz', name: 'Jazz' }] }),
      'GET /api/artists/search': () =>
        jsonResponse({
          artists: [{ id: 'artist-1', name: 'Radiohead', imageUrl: null }],
        }),
      'POST /api/generate/mix': () =>
        ndjsonResponse(progress, { type: 'result', playlist: guestPlaylist }),
    })
    renderWithProviders(<MixPlaylistForm />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('radio', { name: 'Genres' }))
    await user.click(screen.getByRole('button', { name: /Region/ }))
    await user.click(await screen.findByRole('option', { name: 'Argentina' }))
    await user.click(screen.getByRole('button', { name: /Vocals/ }))
    await user.click(await screen.findByRole('option', { name: 'Female vocals' }))
    await user.click(screen.getByRole('button', { name: /Decade/ }))
    await user.click(await screen.findByRole('option', { name: '1980–1989' }))
    await user.click(screen.getByRole('radio', { name: 'Artists' }))
    await user.type(screen.getByRole('combobox'), 'Radiohead')
    await user.click(
      await screen.findByRole('option', { name: /Radiohead/ }, { timeout: 3_000 }),
    )
    await user.click(screen.getByRole('switch', { name: 'Exclude live versions' }))
    await user.click(screen.getByRole('button', { name: 'Generate playlist' }))

    await vi.waitFor(() => {
      expect(generationCalls(calls)).toHaveLength(1)
    })
    const [request] = generationCalls(calls)
    expect(request.body).toMatchObject({
      kind: 'artist_mix',
      filters: {
        region: null,
        femaleVocals: false,
        releaseRange: { fromYear: 1980, toYear: 1989 },
        excludeLive: true,
      },
    })
    expect(request.body).not.toHaveProperty('region')

    await user.click(screen.getByRole('radio', { name: 'Genres', hidden: true }))
    expect(
      screen.getByRole('button', { name: /Region/, hidden: true }),
    ).toHaveTextContent('Argentina')
    expect(
      screen.getByRole('button', { name: /Vocals/, hidden: true }),
    ).toHaveTextContent('Female vocals')
  })
})

describe('MixPlaylistForm generation modes', () => {
  it('generates through the Guest endpoint without publication fields', async () => {
    setAuthState(null)
    const { calls } = stubGeneration()
    renderWithProviders(<MixPlaylistForm />)

    expect(screen.getByRole('heading', { name: 'Size' })).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: 'Size and cover' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Add a cover image')).not.toBeInTheDocument()
    await generateJazzMix('Generate playlist')

    const [request] = generationCalls(calls)
    expect(request.url).toBe('/api/generate/mix')
    expect(request.body).not.toHaveProperty('persistToLibrary')
    expect(request.body).not.toHaveProperty('coverImageBase64')
    expect(request.body).toMatchObject({ kind: 'genre_mix', genreIds: ['jazz'] })

    expect(screen.getByText('Playlist generated')).toBeVisible()
    expect(screen.queryByText('Playlist ready')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Generate new playlist', hidden: true }),
    ).toBeInTheDocument()
    const songs = screen.getByRole('list', { name: 'Songs in this playlist' })
    expect(within(songs).getByText('So What')).toBeVisible()
    expect(
      within(songs).getByText('Miles Davis, John Coltrane · Kind of Blue'),
    ).toBeVisible()
    expect(
      screen.getByText(
        'This playlist is temporary. It will be lost if you leave this page or refresh it.',
      ),
    ).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Open in Spotify' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Transfer with Soundiiz' })).toBeNull()
  })

  it('creates through the Spotify endpoint with the same form', async () => {
    setAuthState(testUser)
    const { calls } = stubGeneration()
    renderWithProviders(<MixPlaylistForm />)

    expect(screen.getByRole('heading', { name: 'Size and cover' })).toBeVisible()
    expect(screen.getByText('Add a cover image')).toBeVisible()
    await generateJazzMix('Create playlist')

    const [request] = generationCalls(calls)
    expect(request.url).toBe('/api/playlists/mix')
    expect(screen.getByText('Playlist ready')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Create new playlist', hidden: true }),
    ).toBeInTheDocument()
    expect(request.body).toMatchObject({
      kind: 'genre_mix',
      genreIds: ['jazz'],
      persistToLibrary: true,
      coverImageBase64: 'cover-data',
    })
    expect(renderPlaylistCoverBase64).toHaveBeenCalledWith({
      title: 'Blendify · Mix · Jazz',
      kind: 'mix',
    })
    expect(screen.getByRole('link', { name: 'Open in Spotify' })).toHaveAttribute(
      'href',
      spotifyPlaylist.spotifyUrl,
    )
    expect(screen.queryByText(/This playlist is temporary/)).toBeNull()
  })
})

describe('MixPlaylistForm after an unconfirmed Spotify creation', () => {
  const outcomeUnknown = {
    type: 'error',
    statusCode: 502,
    code: 'SPOTIFY_OUTCOME_UNKNOWN',
    message: 'Spotify did not confirm the result of this change.',
    details: { operation: 'createPlaylist', category: 'upstream_error', status: 502 },
  }

  beforeEach(() => {
    usePlaylistRunStore.getState().discard()
  })

  async function reachUnconfirmedCreation(
    firstReply: () => Response | Promise<Response> = () =>
      ndjsonResponse(progress, outcomeUnknown),
    heading = 'Couldn’t confirm the playlist',
  ) {
    setAuthState(testUser)
    let creations = 0
    const api = stubApi({
      'GET /api/genres': () =>
        jsonResponse({ genres: [{ id: 'jazz', name: 'Jazz' }] }),
      'POST /api/playlists/mix': () => {
        creations += 1
        return creations === 1
          ? firstReply()
          : ndjsonResponse(progress, { type: 'result', playlist: spotifyPlaylist })
      },
      'GET /api/player/devices': () => jsonResponse({ devices: [] }),
    })
    const user = userEvent.setup()
    renderWithProviders(<MixPlaylistForm />)
    await user.click(screen.getByRole('radio', { name: 'Genres' }))
    await user.click(await screen.findByRole('button', { name: /Jazz/ }))
    await user.click(screen.getByRole('button', { name: 'Create playlist' }))
    await screen.findByRole('heading', { name: heading })
    return { user, calls: api.calls }
  }

  it('does not repeat the creation from the usual button, Enter, or a direct form submit', async () => {
    const { user, calls } = await reachUnconfirmedCreation()

    const submit = screen.getByRole('button', { name: 'Create playlist' })
    expect(submit).toBeDisabled()
    expect(submit).toHaveAccessibleDescription(
      'Check Spotify first. To create another playlist, use “Create a new playlist anyway” above.',
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Spotify didn’t confirm whether the playlist was created',
    )
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()

    await user.click(submit)
    await user.click(screen.getByRole('radio', { name: 'Genres' }))
    await user.keyboard('{Enter}')
    fireEvent.submit(submit.closest('form')!)
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(generationCalls(calls)).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /Jazz/ }).length).toBeGreaterThan(0)
  })

  it('creates another playlist only through the explicit action, with the same input', async () => {
    const { user, calls } = await reachUnconfirmedCreation()

    const createNew = screen.getByRole('button', { name: 'Create a new playlist anyway' })
    expect(createNew).toHaveAccessibleDescription(
      'This sends the same request again as a separate playlist. If the previous one was created, you’ll have both in Spotify.',
    )
    await user.click(createNew)
    await screen.findByRole('heading', { name: 'Blendify · Mix · Jazz' })

    const creations = generationCalls(calls)
    expect(creations).toHaveLength(2)
    expect(creations[1].body).toEqual(creations[0].body)
  })

  it('offers the explicit action to keyboard users', async () => {
    const { user, calls } = await reachUnconfirmedCreation()

    screen.getByRole('button', { name: 'Create a new playlist anyway' }).focus()
    await user.keyboard('{Enter}')
    await screen.findByRole('heading', { name: 'Blendify · Mix · Jazz' })

    expect(generationCalls(calls)).toHaveLength(2)
  })

  it.each([
    [
      'the stream ends after the write without a result',
      () => ndjsonResponse(progress, { ...progress, phase: 'publishing', percent: 95 }),
    ],
    ['the connection drops', () => Promise.reject(new TypeError('network error'))],
  ])('guards the creation the same way when %s', async (_label, firstReply) => {
    const { user, calls } = await reachUnconfirmedCreation(firstReply, 'Lost connection')

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Blendify lost the connection before it could confirm the result.',
    )
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Open Library' })).toBeVisible()
    const submit = screen.getByRole('button', { name: 'Create playlist' })
    expect(submit).toBeDisabled()
    await user.click(submit)
    await user.click(screen.getByRole('radio', { name: 'Genres' }))
    await user.keyboard('{Enter}')
    fireEvent.submit(submit.closest('form')!)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(generationCalls(calls)).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Create a new playlist anyway' }))
    await screen.findByRole('heading', { name: 'Blendify · Mix · Jazz' })

    const creations = generationCalls(calls)
    expect(creations).toHaveLength(2)
    expect(creations[1].body).toEqual(creations[0].body)
  })

  it('keeps the safe retry when the failure proves the creation was never sent', async () => {
    const { user, calls } = await reachUnconfirmedCreation(
      () =>
        ndjsonResponse(progress, {
          type: 'error',
          statusCode: 503,
          code: 'SPOTIFY_UNAVAILABLE',
          message: 'unavailable',
          details: { operation: 'createPlaylist', category: 'network', status: null },
        }),
      'Couldn’t create the playlist',
    )

    expect(screen.getByRole('button', { name: 'Create playlist' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Create a new playlist anyway' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('heading', { name: 'Blendify · Mix · Jazz' })

    const creations = generationCalls(calls)
    expect(creations).toHaveLength(2)
    expect(creations[1].body).toEqual(creations[0].body)
  })
})
