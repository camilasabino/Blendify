import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DiscoverPlaylistForm } from '@/components/playlist/discover-playlist-form'
import { MixPlaylistForm } from '@/components/playlist/mix-playlist-form'
import { messages } from '@/i18n/messages'
import { usePlaylistRunStore } from '@/stores/playlist-run-store'
import {
  jsonResponse,
  ndjsonResponse,
  pendingNdjsonResponse,
  renderWithProviders,
  setAuthState,
  stubApi,
  type PendingNdjsonStream,
} from '@/test/app-harness'

vi.mock('@/lib/playlist-cover', () => ({
  renderPlaylistCoverBase64: vi.fn().mockResolvedValue('cover-data'),
}))

const emptySelection = {
  type: 'error',
  statusCode: 422,
  code: 'NO_TRACKS_FOUND',
  message: 'No tracks found for this selection.',
}

const radiohead = { id: 'artist-1', name: 'Radiohead', imageUrl: null }
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

afterEach(() => {
  usePlaylistRunStore.getState().discard()
  vi.unstubAllGlobals()
})

async function selectOption(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  const option = await screen.findByRole('option', { name }, { timeout: 3_000 })
  await user.click(option.firstElementChild!)
}

describe('empty playlist generation', () => {
  it('tells an Artist Mix to change artists, genres or refinement filters', async () => {
    setAuthState(null)
    stubApi({
      'GET /api/artists/search': () => jsonResponse({ artists: [radiohead] }),
      'POST /api/generate/mix': () => ndjsonResponse(emptySelection),
    })
    const user = userEvent.setup()
    renderWithProviders(<MixPlaylistForm />)

    await user.type(screen.getByRole('combobox'), 'Radiohead')
    await selectOption(user, /Radiohead/)
    await user.click(screen.getByRole('button', { name: 'Generate playlist' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(messages.en['create.noTracksFound'])
    expect(alert.textContent).not.toMatch(/familiarity/i)
  })

  it('uses the same Mix recovery for a Genre Mix', async () => {
    setAuthState(null)
    stubApi({
      'GET /api/genres': () => jsonResponse({ genres: [{ id: 'jazz', name: 'Jazz' }] }),
      'POST /api/generate/mix': () => ndjsonResponse(emptySelection),
    })
    const user = userEvent.setup()
    renderWithProviders(<MixPlaylistForm />)

    await user.click(screen.getByRole('radio', { name: 'Genres' }))
    await user.click(await screen.findByRole('button', { name: /Jazz/ }))
    await user.click(screen.getByRole('button', { name: 'Generate playlist' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(messages.en['create.noTracksFound'])
  })

  it('tells Discover Artist to change the starting point or refinement filters', async () => {
    setAuthState(null)
    stubApi({
      'GET /api/artists/search': () => jsonResponse({ artists: [radiohead] }),
      'POST /api/generate/discover': () => ndjsonResponse(emptySelection),
    })
    const user = userEvent.setup()
    renderWithProviders(<DiscoverPlaylistForm />, { route: '/app/discover' })

    await user.type(screen.getByRole('combobox', { name: 'Artist' }), 'Radiohead')
    await selectOption(user, /Radiohead/)
    await user.click(screen.getByRole('button', { name: 'Generate playlist' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(messages.en['discover.noTracksFound'])
    expect(alert).toHaveTextContent('Refine results')
    expect(alert.textContent).not.toMatch(/familiarity/i)
  })

  it('uses the same Discover recovery for a song starting point', async () => {
    setAuthState(null)
    stubApi({
      'GET /api/tracks/search': () => jsonResponse({ tracks: [stay] }),
      'POST /api/generate/discover': () => ndjsonResponse(emptySelection),
    })
    const user = userEvent.setup()
    renderWithProviders(<DiscoverPlaylistForm />, { route: '/app/discover' })

    await user.click(screen.getByRole('radio', { name: 'Song' }))
    await user.type(screen.getByRole('combobox', { name: 'Song' }), 'stay')
    await selectOption(user, /Stay/)
    await user.click(screen.getByRole('button', { name: 'Generate playlist' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(messages.en['discover.noTracksFound'])
  })

  it('does not show an error when the generation is cancelled', async () => {
    setAuthState(null)
    const streams: PendingNdjsonStream[] = []
    stubApi({
      'GET /api/genres': () => jsonResponse({ genres: [{ id: 'jazz', name: 'Jazz' }] }),
      'POST /api/generate/mix': (_call, signal) => {
        const pending = pendingNdjsonResponse(signal)
        streams.push(pending)
        return pending.response
      },
    })
    const user = userEvent.setup()
    renderWithProviders(<MixPlaylistForm />)

    await user.click(screen.getByRole('radio', { name: 'Genres' }))
    await user.click(await screen.findByRole('button', { name: /Jazz/ }))
    await user.click(screen.getByRole('button', { name: 'Generate playlist' }))
    await screen.findByRole('heading', { name: 'Generating your playlist' })

    usePlaylistRunStore.getState().discard()

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Generating your playlist' })).toBeNull()
    })
    expect(streams[0]?.signal?.aborted).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText(messages.en['create.failed'])).toBeNull()
    expect(screen.queryByText(messages.en['create.noTracksFound'])).toBeNull()
  })
})
