import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AiSessionDestinationDto } from '@blendify/contracts'
import {
  jsonResponse,
  renderWithProviders,
  setAuthState,
  stubApi,
  testUser,
  type FetchCall,
} from '@/test/app-harness'
import {
  AI_SESSION_ID,
  aiGeneration,
  generatedAiSessionState,
  storeAiSession,
} from '@/test/ai-session-fixtures'
import { api } from '@/lib/api'
import { AiPlaylistPage } from './ai-playlist-page'

const libraryPreference = vi.hoisted(() => ({ persist: true }))

vi.mock('@/lib/persist-to-library-preference', () => ({
  readPersistToLibraryPreference: () => libraryPreference.persist,
  writePersistToLibraryPreference: vi.fn(),
}))

const SESSION_ROUTE = `GET /api/ai/sessions/${AI_SESSION_ID}`
const PUBLISH_ROUTE = `POST /api/ai/sessions/${AI_SESSION_ID}/publish`
const TRANSFER_ROUTE = `POST /api/ai/sessions/${AI_SESSION_ID}/transfer`
const SUGGESTED_TITLE = 'Blendify · Mix · Radiohead + Interpol'
const SPOTIFY_URL = 'https://open.spotify.com/playlist/p1'
const SOUNDIIZ_URL = 'https://soundiiz.com/go/import-playlist/abcdefghijklmnop'

function stateWith(destination: AiSessionDestinationDto | null, transferAvailable = true) {
  return generatedAiSessionState(aiGeneration({ transferAvailable }), destination)
}

function apiError(status: number, code: string, details?: object) {
  return jsonResponse({ statusCode: status, code, message: 'provider detail', details }, status)
}

function destinationCalls(calls: FetchCall[]) {
  return calls.filter((call) => /\/(publish|transfer)$/.test(call.url))
}

async function renderGenerated(
  routes: Parameters<typeof stubApi>[0],
  options: { title?: string | null; state?: ReturnType<typeof stateWith> } = {},
) {
  storeAiSession(undefined, options.title ?? null)
  const api = stubApi({
    [SESSION_ROUTE]: () => jsonResponse(options.state ?? stateWith(null)),
    ...routes,
  })
  renderWithProviders(<AiPlaylistPage />, { route: '/app/ai' })
  await screen.findByRole('heading', { name: options.title ?? SUGGESTED_TITLE })
  return api
}

function publishButton() {
  return screen.getByRole('button', { name: 'Save to Spotify' })
}

beforeEach(() => {
  sessionStorage.clear()
  libraryPreference.persist = true
  setAuthState(null)
})

afterEach(() => {
  sessionStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Create with AI Guest destination', () => {
  it('prepares a Soundiiz transfer only on click, with the edited title', async () => {
    const user = userEvent.setup()
    let resolveTransfer: (response: Response) => void = () => undefined
    const { calls } = await renderGenerated(
      {
        [TRANSFER_ROUTE]: () =>
          new Promise<Response>((resolve) => {
            resolveTransfer = resolve
          }),
      },
      { title: 'Rainy run' },
    )

    expect(destinationCalls(calls)).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Save to Spotify' })).toBeNull()
    const prepare = screen.getByRole('button', { name: 'Prepare transfer' })
    await user.click(prepare)
    await user.click(prepare)
    expect(screen.getByRole('button', { name: 'Preparing transfer…' })).toBeDisabled()

    resolveTransfer(
      jsonResponse(
        stateWith({
          status: 'transfer_prepared',
          transfer: { url: SOUNDIIZ_URL, expiresAt: '2099-01-01T00:00:00.000Z', trackCount: 20 },
        }),
      ),
    )

    const link = await screen.findByRole('link', {
      name: 'Continue on Soundiiz (opens in a new tab)',
    })
    expect(link).toHaveAttribute('href', SOUNDIIZ_URL)
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    await waitFor(() => expect(link).toHaveFocus())
    expect(destinationCalls(calls)).toEqual([
      { url: `/api/ai/sessions/${AI_SESSION_ID}/transfer`, method: 'POST', body: { name: 'Rainy run' } },
    ])
    expect(screen.getByText(/Transfer prepared for 20 tracks/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Edit title' })).toBeNull()
    expect(screen.getByText('This is a preview. It isn’t saved to Spotify.')).toBeVisible()
  })

  it('restores a prepared transfer without preparing another one', async () => {
    const { calls } = await renderGenerated(
      {},
      {
        state: stateWith({
          status: 'transfer_prepared',
          transfer: { url: SOUNDIIZ_URL, expiresAt: '2099-01-01T00:00:00.000Z', trackCount: 20 },
        }),
      },
    )

    expect(
      await screen.findByRole('link', { name: 'Continue on Soundiiz (opens in a new tab)' }),
    ).not.toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Prepare transfer' })).toBeNull()
    expect(destinationCalls(calls)).toHaveLength(0)
  })

  it('shows no transfer action when Guest transfer is unavailable', async () => {
    await renderGenerated({}, { state: stateWith(null, false) })

    expect(screen.queryByRole('button', { name: 'Prepare transfer' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save to Spotify' })).toBeNull()
  })

  it('keeps Soundiiz errors typed and retryable', async () => {
    const user = userEvent.setup()
    await renderGenerated({
      [TRANSFER_ROUTE]: () =>
        apiError(503, 'TRANSFER_PROVIDER_UNAVAILABLE', { retryAfterSeconds: 30 }),
    })

    await user.click(screen.getByRole('button', { name: 'Prepare transfer' }))

    const message = await screen.findByText(/Soundiiz isn’t responding right now\. Try again in/)
    expect(message).toHaveAttribute('role', 'alert')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
    expect(document.body.textContent).not.toContain('provider detail')
  })
})

describe('Create with AI Spotify destination', () => {
  beforeEach(() => setAuthState(testUser))

  it('saves the server-held preview to Spotify with the edited title only after the click', async () => {
    const user = userEvent.setup()
    let resolvePublish: (response: Response) => void = () => undefined
    const { calls } = await renderGenerated(
      {
        [PUBLISH_ROUTE]: () =>
          new Promise<Response>((resolve) => {
            resolvePublish = resolve
          }),
      },
      { title: 'Late night edit' },
    )

    expect(destinationCalls(calls)).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Prepare transfer' })).toBeNull()
    expect(
      screen.getByText(
        'Blendify will create a private playlist with this title in your Spotify account and add it to your Library.',
      ),
    ).toBeVisible()
    await user.click(publishButton())
    const busy = await screen.findByRole('button', { name: 'Saving to Spotify…' })
    expect(busy).toBeDisabled()
    await user.click(busy)
    expect(screen.queryByRole('button', { name: 'Edit title' })).toBeNull()

    resolvePublish(
      jsonResponse(stateWith({ status: 'published', spotifyUrl: SPOTIFY_URL, savedToLibrary: true })),
    )

    const saved = await screen.findByRole('heading', { name: 'Saved to Spotify' })
    await waitFor(() => expect(saved).toHaveFocus())
    expect(screen.getByText('The playlist is now in your Spotify account and your Library.')).toBeVisible()
    const open = screen.getByRole('link', { name: 'Open in Spotify (opens in a new tab)' })
    expect(open).toHaveAttribute('href', SPOTIFY_URL)
    expect(open).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.queryByRole('button', { name: 'Save to Spotify' })).toBeNull()
    expect(screen.queryByText('This is a preview. It isn’t saved to Spotify.')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Late night edit' })).toBeVisible()

    const publishCalls = destinationCalls(calls)
    expect(publishCalls).toHaveLength(1)
    expect(publishCalls[0].body).toEqual({ name: 'Late night edit', persistToLibrary: true })
  })

  it('follows the Library preference and falls back to the suggested title', async () => {
    libraryPreference.persist = false
    const user = userEvent.setup()
    const { calls } = await renderGenerated({
      [PUBLISH_ROUTE]: () =>
        jsonResponse(stateWith({ status: 'published', spotifyUrl: SPOTIFY_URL, savedToLibrary: false })),
    })

    expect(
      screen.getByText('Blendify will create a private playlist with this title in your Spotify account.'),
    ).toBeVisible()
    await user.click(publishButton())

    expect(await screen.findByText('The playlist is now in your Spotify account.')).toBeVisible()
    expect(destinationCalls(calls)[0].body).toEqual({
      name: SUGGESTED_TITLE,
      persistToLibrary: false,
    })
  })

  it.each([
    ['revoked Spotify authorization', 'SPOTIFY_REAUTH_REQUIRED'],
    ['expired Blendify session', 'UNAUTHORIZED'],
  ])(
    'offers to reconnect Spotify instead of retrying after a %s, keeping the preview',
    async (_label, code) => {
      const user = userEvent.setup()
      const loginUrl = vi.spyOn(api, 'loginUrl').mockReturnValue('#reconnect')
      const { calls } = await renderGenerated({ [PUBLISH_ROUTE]: () => apiError(401, code) })

      await user.click(publishButton())

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Spotify needs you to connect again before saving this playlist. The preview stays here.',
      )
      expect(screen.queryByRole('button', { name: 'Save to Spotify' })).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: SUGGESTED_TITLE })).toBeVisible()
      expect(screen.getByRole('list', { name: 'Songs in this playlist' })).toBeVisible()
      const reconnect = screen.getByRole('button', { name: 'Connect Spotify' })
      await waitFor(() => expect(reconnect).toHaveFocus())

      await user.keyboard('{Enter}')

      expect(loginUrl).toHaveBeenCalledTimes(1)
      expect(sessionStorage.getItem('blendify.appReturnTo')).toContain('/app/ai')
      expect(sessionStorage.getItem('blendify.aiSession')).not.toBeNull()
      expect(destinationCalls(calls)).toHaveLength(1)
    },
  )

  it('reloads the session when the playlist was already sent from another tab', async () => {
    const user = userEvent.setup()
    const states = [
      stateWith(null),
      stateWith({ status: 'published', spotifyUrl: SPOTIFY_URL, savedToLibrary: true }),
    ]
    const { calls } = await renderGenerated({
      [SESSION_ROUTE]: () => jsonResponse(states.length > 1 ? states.shift() : states[0]),
      [PUBLISH_ROUTE]: () => apiError(409, 'AI_DESTINATION_UNAVAILABLE'),
    })

    await user.click(publishButton())

    expect(await screen.findByRole('heading', { name: 'Saved to Spotify' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Save to Spotify' })).toBeNull()
    expect(destinationCalls(calls)).toHaveLength(1)
  })

  it('keeps Retry for a temporary Spotify failure instead of asking to reconnect', async () => {
    const user = userEvent.setup()
    await renderGenerated({ [PUBLISH_ROUTE]: () => apiError(500, 'INTERNAL_ERROR') })

    await user.click(publishButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t save the playlist to Spotify. Try again.',
    )
    expect(publishButton()).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Connect Spotify' })).not.toBeInTheDocument()
  })

  it('shows the typed Spotify limit and lets the user try again', async () => {
    const user = userEvent.setup()
    await renderGenerated({
      [PUBLISH_ROUTE]: () => apiError(429, 'SPOTIFY_RATE_LIMITED', { retryAfterSeconds: 45 }),
    })

    await user.click(publishButton())

    const message = await screen.findByText(/Too many requests\. Try again in/)
    expect(message).toHaveAttribute('role', 'alert')
    expect(document.body.textContent).not.toMatch(/SPOTIFY_RATE_LIMITED|provider detail/)
    expect(publishButton()).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Connect Spotify' })).not.toBeInTheDocument()
  })

  it('returns to the composer when the session expired', async () => {
    const user = userEvent.setup()
    await renderGenerated({ [PUBLISH_ROUTE]: () => apiError(404, 'AI_SESSION_NOT_FOUND') })

    await user.click(publishButton())

    expect(await screen.findByRole('textbox', { name: 'Playlist request' })).toBeVisible()
    expect(sessionStorage.getItem('blendify.aiSession')).toBeNull()
  })

  it('restores a published playlist without publishing again', async () => {
    const { calls } = await renderGenerated(
      {},
      { state: stateWith({ status: 'published', spotifyUrl: SPOTIFY_URL, savedToLibrary: true }) },
    )

    expect(screen.getByRole('heading', { name: 'Saved to Spotify' })).not.toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Save to Spotify' })).toBeNull()
    expect(destinationCalls(calls)).toHaveLength(0)
  })

  it('explains a partial or uncertain publish without offering a retry', async () => {
    await renderGenerated(
      {},
      { state: stateWith({ status: 'publish_incomplete', spotifyUrl: SPOTIFY_URL }) },
    )

    const section = screen
      .getByRole('heading', { name: 'Couldn’t finish saving to Spotify' })
      .closest('section') as HTMLElement
    expect(within(section).getByRole('alert')).toHaveTextContent(
      'Blendify created the playlist on Spotify but couldn’t finish saving it.',
    )
    expect(within(section).getByRole('link', { name: /Open in Spotify/ })).toHaveAttribute(
      'href',
      SPOTIFY_URL,
    )
    expect(screen.queryByRole('button', { name: /Save to Spotify|Try again/ })).toBeNull()
  })

  it('reports an uncertain publish without a Spotify link', async () => {
    await renderGenerated({}, { state: stateWith({ status: 'publish_incomplete', spotifyUrl: null }) })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Blendify couldn’t confirm whether the playlist was created on Spotify.',
    )
    expect(screen.queryByRole('link', { name: /Open in Spotify/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save to Spotify' })).toBeNull()
  })
})
