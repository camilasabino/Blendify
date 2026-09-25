import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MixPlaylistForm } from '@/components/playlist/mix-playlist-form'
import { renderPlaylistCoverBase64 } from '@/lib/playlist-cover'
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
