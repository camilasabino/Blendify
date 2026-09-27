import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AiGenerationFailureDto } from '@blendify/contracts'
import { useLocaleStore } from '@/i18n/use-locale'
import {
  jsonResponse,
  ndjsonResponse,
  pendingNdjsonResponse,
  renderWithProviders,
  setAuthState,
  stubApi,
  testUser,
  type FetchCall,
  type PendingNdjsonStream,
} from '@/test/app-harness'
import {
  AI_PROMPT,
  AI_SESSION_ID,
  aiGeneration,
  aiIntent,
  aiTracks,
  failedAiSessionState,
  generatedAiSessionState,
  generatingAiSessionState,
  reviewedAiSession,
  reviewedAiSessionState,
  storeAiSession,
} from '@/test/ai-session-fixtures'
import { AiPlaylistPage } from './ai-playlist-page'

const CREATE_ROUTE = 'POST /api/ai/sessions'
const GENERATE_ROUTE = `POST /api/ai/sessions/${AI_SESSION_ID}/generate`
const SESSION_ROUTE = `GET /api/ai/sessions/${AI_SESSION_ID}`
const RAW_IDENTIFIERS = [
  'track_count',
  'seed_not_mood_based',
  'mood_not_enforced_for_explicit_genres',
  'provider_rate_limited',
  'provider_unavailable',
  'seed_not_found',
  'SPOTIFY_QUOTA_EXCEEDED',
  'CATALOG_UNAVAILABLE',
  'AI_SEED_NOT_FOUND',
  '429',
  'Retry-After',
]

function renderPage() {
  return renderWithProviders(<AiPlaylistPage />, { route: '/app/ai' })
}

function promptField() {
  return screen.getByRole('textbox', { name: 'Playlist request' })
}

function createButton() {
  return screen.getByRole('button', { name: 'Create playlist' })
}

function interpretCalls(calls: FetchCall[]) {
  return calls.filter((call) => call.method === 'POST' && call.url === '/api/ai/sessions')
}

function generateCalls(calls: FetchCall[]) {
  return calls.filter((call) => call.url === `/api/ai/sessions/${AI_SESSION_ID}/generate`)
}

async function reviewRequest(user: ReturnType<typeof userEvent.setup>) {
  await user.type(promptField(), AI_PROMPT)
  await user.click(screen.getByRole('button', { name: 'Review request' }))
  await screen.findByRole('heading', { name: 'Here’s what Blendify understood' })
}

function expectNoRawIdentifiers() {
  const text = document.body.textContent ?? ''
  for (const identifier of RAW_IDENTIFIERS) {
    expect(text).not.toContain(identifier)
  }
}

function failureError(code: string, message: string, statusCode: number, details?: object) {
  return { type: 'error', statusCode, code, message, ...(details ? { details } : {}) }
}

async function failGeneration(
  streamError: ReturnType<typeof failureError>,
  persisted: AiGenerationFailureDto,
) {
  const user = userEvent.setup()
  const sessionStates = [failedAiSessionState(persisted)]
  const { calls } = stubApi({
    [CREATE_ROUTE]: () => jsonResponse(reviewedAiSession(), 201),
    [GENERATE_ROUTE]: () => ndjsonResponse(streamError),
    [SESSION_ROUTE]: () => jsonResponse(sessionStates[0]),
  })
  renderPage()
  await reviewRequest(user)
  await user.click(createButton())
  const heading = await screen.findByRole('heading', { name: 'Couldn’t create your playlist' })
  return { user, calls, heading }
}

beforeEach(() => {
  sessionStorage.clear()
  setAuthState(null)
})

afterEach(() => {
  sessionStorage.clear()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Create with AI generation', () => {
  it('offers Create playlist only once the request is reviewed', async () => {
    const user = userEvent.setup()
    stubApi({ [CREATE_ROUTE]: () => jsonResponse(reviewedAiSession(), 201) })
    renderPage()

    expect(screen.queryByRole('button', { name: 'Create playlist' })).toBeNull()
    await reviewRequest(user)

    const summary = screen
      .getByRole('heading', { name: 'Here’s what Blendify understood' })
      .closest('section') as HTMLElement
    expect(within(summary).getByRole('button', { name: 'Create playlist' })).toBeEnabled()
    expect(within(summary).getByRole('button', { name: 'Start over' })).toBeEnabled()
    expect(within(summary).getByText('Not used')).toBeVisible()
    expect(within(summary).getByText(/for a long run/)).toBeVisible()
  })

  it('generates once through the NestJS stream and shows truthful progress', async () => {
    const user = userEvent.setup()
    let stream: PendingNdjsonStream | null = null
    const { calls, fetchMock } = stubApi({
      [CREATE_ROUTE]: () => jsonResponse(reviewedAiSession(), 201),
      [GENERATE_ROUTE]: (_call, signal) => {
        stream = pendingNdjsonResponse(signal)
        return stream.response
      },
    })
    renderPage()
    await reviewRequest(user)

    await user.click(createButton())

    const progressHeading = await screen.findByRole('heading', { name: 'Creating your playlist…' })
    await waitFor(() => expect(progressHeading).toHaveFocus())

    expect(screen.queryByRole('button', { name: /Create playlist|Creating playlist/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Start over' })).toBeNull()
    expect(
      screen.getAllByRole('status').filter((status) => status.textContent?.trim()),
    ).toHaveLength(1)
    expect(screen.getByText('Creating your playlist…')).toBeVisible()
    expect(screen.getAllByText(/Creating/)).toHaveLength(1)
    expect(
      within(screen.getByRole('region', { name: 'Here’s what Blendify understood' })).getByText(
        'Radiohead · Interpol',
      ),
    ).toBeVisible()
    expect(generateCalls(calls)).toEqual([
      { url: `/api/ai/sessions/${AI_SESSION_ID}/generate`, method: 'POST', body: undefined },
    ])
    const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit
    expect(init.headers).toMatchObject({ Accept: 'application/x-ndjson' })
    const progressPanel = progressHeading.closest('section') as HTMLElement
    expect(within(progressPanel).getByRole('status')).toHaveTextContent(
      'Finding music for your request',
    )

    await act(async () => {
      stream?.push({ type: 'progress', phase: 'matching_tracks', current: 9, total: 30, percent: 30 })
    })
    expect(within(progressPanel).getByRole('status')).toHaveTextContent('Finding songs')
    expect(within(progressPanel).getByText('30%')).toBeVisible()
    expect(progressPanel.textContent).not.toContain('of 30')

    const editButton = screen.getByRole('button', { name: 'Edit request' })
    editButton.focus()
    await act(async () => {
      stream?.push({ type: 'progress', phase: 'matching_tracks', current: 18, total: 30, percent: 60 })
    })
    expect(editButton).toHaveFocus()

    await act(async () => {
      stream?.push({ type: 'result', playlist: aiGeneration() })
      stream?.close()
    })

    const title = await screen.findByRole('heading', {
      name: 'Blendify · Mix · Radiohead + Interpol',
    })
    await waitFor(() => expect(title).toHaveFocus())
    expect(interpretCalls(calls)).toHaveLength(1)
    expect(calls.every((call) => !call.url.includes('/interpret'))).toBe(true)
  })

  it('shows the generated playlist as a preview without publish actions', async () => {
    const user = userEvent.setup()
    stubApi({
      [CREATE_ROUTE]: () => jsonResponse(reviewedAiSession(), 201),
      [GENERATE_ROUTE]: () => ndjsonResponse({ type: 'result', playlist: aiGeneration() }),
    })
    renderPage()
    await reviewRequest(user)
    await user.click(createButton())

    const title = await screen.findByRole('heading', {
      name: 'Blendify · Mix · Radiohead + Interpol',
    })
    const result = title.closest('section') as HTMLElement
    expect(within(result).getByText('Playlist preview')).toBeVisible()
    expect(within(result).getByText('20 songs · 1 h')).toBeVisible()
    expect(within(result).getByText('This is a preview. It isn’t saved to Spotify.')).toBeVisible()
    const trackList = within(result).getByRole('list', { name: 'Songs in this playlist' })
    expect(within(trackList).getByText('Song 1')).toBeVisible()
    expect(within(trackList).getAllByText(/Radiohead/).length).toBeGreaterThan(0)
    expect(result.textContent).not.toContain('30')
    expect(screen.queryByText('Some preferences couldn’t be fully applied')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Create playlist' })).toBeNull()
    expect(screen.queryByRole('button', { name: /save|publish|add to spotify|soundiiz/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /soundiiz/i })).toBeNull()
    expect(screen.getByText('Not used')).toBeVisible()

    const summary = screen.getByRole('region', { name: 'Here’s what Blendify understood' })
    expect(within(summary).getByText('The request used to create this preview.')).toBeVisible()
    expect(within(summary).getByText('Radiohead · Interpol')).toBeVisible()
    expect(within(summary).getByText('Coldplay')).toBeVisible()
    expect(
      screen.queryByText('Check these settings. Edit your request if something is off.'),
    ).toBeNull()
    expect(screen.queryByText('Blendify will create a preview of your playlist.')).toBeNull()
    expect(within(result).getByRole('button', { name: 'Start over' })).toBeVisible()
  })

  it('reports unmet constraints separately from unsupported details, without raw enums', async () => {
    const user = userEvent.setup()
    const intent = { ...aiIntent, targetTrackCount: 30, targetDurationMinutes: 60, mood: 'happy' as const }
    stubApi({
      [CREATE_ROUTE]: () => jsonResponse(reviewedAiSession(intent), 201),
      [GENERATE_ROUTE]: () =>
        ndjsonResponse({
          type: 'result',
          playlist: aiGeneration({
            intent,
            tracks: aiTracks(16),
            unmetConstraints: [
              { type: 'track_count', requested: 30, actual: 16 },
              { type: 'duration', requestedMinutes: 60, actualDurationMs: 2_880_000 },
              { type: 'mood', mood: 'happy', reason: 'seed_not_mood_based' },
            ],
          }),
        }),
    })
    renderPage()
    await reviewRequest(user)
    await user.click(createButton())

    const unmet = (
      await screen.findByRole('heading', { name: 'Some preferences couldn’t be fully applied' })
    ).closest('section') as HTMLElement
    const items = within(unmet).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Songs: You asked for 30 songs; this playlist has 16.')
    expect(items[1]).toHaveTextContent('Length: You asked for about 60 min; this playlist runs 48 min.')
    expect(items[2]).toHaveTextContent(
      'Mood · Happy: Blendify built this playlist from the artists or song you named, so it couldn’t guarantee this mood.',
    )
    expect(unmet.textContent).not.toContain('for a long run')
    expect(screen.getByText('Not used').closest('div')?.textContent).toContain('for a long run')
    expect(screen.queryByText(/min requested/)).toBeNull()
    expectNoRawIdentifiers()
  })

  it('explains an unenforced mood for explicit genres and a satisfied duration', async () => {
    const user = userEvent.setup()
    const intent = {
      ...aiIntent,
      kind: 'genre_mix' as const,
      artists: [],
      genres: ['pop'],
      targetTrackCount: null,
      targetDurationMinutes: 60,
      mood: 'happy' as const,
    }
    stubApi({
      [CREATE_ROUTE]: () => jsonResponse(reviewedAiSession(intent), 201),
      [GENERATE_ROUTE]: () =>
        ndjsonResponse({
          type: 'result',
          playlist: aiGeneration({
            intent,
            unmetConstraints: [
              { type: 'mood', mood: 'happy', reason: 'mood_not_enforced_for_explicit_genres' },
            ],
          }),
        }),
    })
    renderPage()
    await reviewRequest(user)
    await user.click(createButton())

    await screen.findByRole('heading', { name: 'Some preferences couldn’t be fully applied' })
    expect(screen.getByText('20 songs · 1 h')).toBeVisible()
    expect(screen.getByText(/about 60 min requested/)).toBeVisible()
    expect(
      screen.getByText('Blendify used the genres you named as they are, so it couldn’t guarantee this mood.'),
    ).toBeVisible()
    expect(document.body.textContent).not.toMatch(/not happy|outside/i)
    expectNoRawIdentifiers()
  })

  it('renders the same generated playlist in Spotify Mode', async () => {
    setAuthState(testUser)
    const user = userEvent.setup()
    const { calls } = stubApi({
      [CREATE_ROUTE]: () => jsonResponse(reviewedAiSession(), 201),
      [GENERATE_ROUTE]: () => ndjsonResponse({ type: 'result', playlist: aiGeneration() }),
    })
    renderPage()
    await reviewRequest(user)
    await user.click(createButton())

    await screen.findByRole('heading', { name: 'Blendify · Mix · Radiohead + Interpol' })
    expect(screen.getByText('20 songs · 1 h')).toBeVisible()
    expect(screen.getByText('This is a preview. It isn’t saved to Spotify.')).toBeVisible()
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'POST /api/ai/sessions',
      `POST /api/ai/sessions/${AI_SESSION_ID}/generate`,
    ])
  })
})

describe('Create with AI generation failures', () => {
  it('asks to edit the request when a seed is not found', async () => {
    const { user, calls, heading } = await failGeneration(
      failureError('AI_SEED_NOT_FOUND', 'Artist not found', 422, {
        seedType: 'artist',
        names: ['Radiohed'],
      }),
      {
        code: 'AI_SEED_NOT_FOUND',
        category: 'seed_not_found',
        retryAfterSeconds: null,
        seedNotFound: { seedType: 'artist', names: ['Radiohed'] },
      },
    )

    await waitFor(() => expect(heading).toHaveFocus())
    const panel = heading.closest('section') as HTMLElement
    expect(within(panel).getByRole('alert')).toHaveTextContent(
      'Blendify couldn’t find “Radiohed” on Spotify.',
    )
    expect(within(panel).queryByRole('button', { name: 'Try again' })).toBeNull()
    expectNoRawIdentifiers()

    await user.click(within(panel).getByRole('button', { name: 'Edit request' }))

    expect(promptField()).toHaveValue(AI_PROMPT)
    expect(promptField()).toHaveFocus()
    expect(generateCalls(calls)).toHaveLength(1)
  })

  it('shows the Spotify limit with the normalized wait and offers a retry', async () => {
    const { user, calls, heading } = await failGeneration(
      failureError('SPOTIFY_QUOTA_EXCEEDED', 'Quota exceeded', 429, { retryAfterSeconds: 14_400 }),
      { code: 'SPOTIFY_QUOTA_EXCEEDED', category: 'provider_rate_limited', retryAfterSeconds: 14_400, seedNotFound: null },
    )

    const panel = heading.closest('section') as HTMLElement
    expect(within(panel).getByRole('alert')).toHaveTextContent(
      'Spotify is temporarily limiting requests from Blendify. Try again in about 4 hours.',
    )
    expectNoRawIdentifiers()

    await user.click(within(panel).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(generateCalls(calls)).toHaveLength(2))
  })

  it('uses try-later wording when the limit has no wait time', async () => {
    const { heading } = await failGeneration(
      failureError('SPOTIFY_RATE_LIMITED', 'Rate limited', 429),
      { code: 'SPOTIFY_RATE_LIMITED', category: 'provider_rate_limited', retryAfterSeconds: null, seedNotFound: null },
    )

    expect(within(heading.closest('section') as HTMLElement).getByRole('alert')).toHaveTextContent(
      'Spotify is temporarily limiting requests from Blendify. Try again later.',
    )
  })

  it('distinguishes an unavailable provider from a rate limit', async () => {
    const { heading } = await failGeneration(
      failureError('CATALOG_UNAVAILABLE', 'Catalog unavailable', 503),
      { code: 'CATALOG_UNAVAILABLE', category: 'provider_unavailable', retryAfterSeconds: null, seedNotFound: null },
    )

    const alert = within(heading.closest('section') as HTMLElement).getByRole('alert')
    expect(alert).toHaveTextContent("Spotify isn’t responding right now. Try again in a few minutes.")
    expect(alert.textContent).not.toMatch(/limit/i)
    expectNoRawIdentifiers()
  })

  it('offers an explicit retry after an interrupted generation', async () => {
    const { heading } = await failGeneration(
      failureError('INTERNAL_ERROR', 'Internal error', 500),
      { code: 'AI_GENERATION_INTERRUPTED', category: 'failed', retryAfterSeconds: null, seedNotFound: null },
    )

    const panel = heading.closest('section') as HTMLElement
    expect(within(panel).getByRole('alert')).toHaveTextContent(
      'Creating your playlist was interrupted. Try again.',
    )
    expect(within(panel).getByRole('button', { name: 'Try again' })).toBeEnabled()
    expect(within(panel).queryByRole('button', { name: 'Edit request' })).toBeNull()
  })

  it('keeps the reviewed request when Blendify limits the generate call itself', async () => {
    const user = userEvent.setup()
    stubApi({
      [CREATE_ROUTE]: () => jsonResponse(reviewedAiSession(), 201),
      [GENERATE_ROUTE]: () =>
        jsonResponse(
          { statusCode: 429, code: 'RATE_LIMITED', message: 'Too many', details: { retryAfterSeconds: 30 } },
          429,
        ),
      [SESSION_ROUTE]: () => jsonResponse(reviewedAiSessionState()),
    })
    renderPage()
    await reviewRequest(user)
    await user.click(createButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests. Try again in about 30 seconds.')
    expect(createButton()).toBeEnabled()
    expect(screen.queryByRole('heading', { name: 'Couldn’t create your playlist' })).toBeNull()
  })

  it('shows the authoritative result when the stream reports another attempt', async () => {
    const user = userEvent.setup()
    stubApi({
      [CREATE_ROUTE]: () => jsonResponse(reviewedAiSession(), 201),
      [GENERATE_ROUTE]: () =>
        ndjsonResponse(failureError('AI_GENERATION_SUPERSEDED', 'Superseded', 409)),
      [SESSION_ROUTE]: () => jsonResponse(generatedAiSessionState()),
    })
    renderPage()
    await reviewRequest(user)
    await user.click(createButton())

    await screen.findByRole('heading', { name: 'Blendify · Mix · Radiohead + Interpol' })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.body.textContent).not.toMatch(/superseded/i)
  })
})

describe('Create with AI session restore', () => {
  it('restores a reviewed request with only a session read', async () => {
    storeAiSession()
    const { calls } = stubApi({ [SESSION_ROUTE]: () => jsonResponse(reviewedAiSessionState()) })
    renderPage()

    const heading = await screen.findByRole('heading', { name: 'Here’s what Blendify understood' })
    expect(heading).not.toHaveFocus()
    expect(screen.getByText(`“${AI_PROMPT}”`)).toBeVisible()
    expect(createButton()).toBeEnabled()
    expect(calls).toEqual([
      { url: `/api/ai/sessions/${AI_SESSION_ID}`, method: 'GET', body: undefined },
    ])
  })

  it('restores a generated playlist', async () => {
    storeAiSession()
    const { calls } = stubApi({ [SESSION_ROUTE]: () => jsonResponse(generatedAiSessionState()) })
    renderPage()

    await screen.findByRole('heading', { name: 'Blendify · Mix · Radiohead + Interpol' })
    expect(screen.getByText('20 songs · 1 h')).toBeVisible()
    expect(calls.map((call) => call.method)).toEqual(['GET'])
  })

  it('restores a missing seed with its name and Edit request as the primary recovery', async () => {
    const user = userEvent.setup()
    storeAiSession()
    const { calls } = stubApi({
      [SESSION_ROUTE]: () =>
        jsonResponse(
          failedAiSessionState({
            code: 'AI_SEED_NOT_FOUND',
            category: 'seed_not_found',
            retryAfterSeconds: null,
            seedNotFound: { seedType: 'artist', names: ['Radiohed'] },
          }),
        ),
    })
    renderPage()

    const heading = await screen.findByRole('heading', { name: 'Couldn’t create your playlist' })
    const panel = heading.closest('section') as HTMLElement
    expect(within(panel).getByRole('alert')).toHaveTextContent(
      'Blendify couldn’t find “Radiohed” on Spotify.',
    )
    expect(within(panel).queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(calls.map((call) => call.method)).toEqual(['GET'])

    await user.click(within(panel).getByRole('button', { name: 'Edit request' }))
    expect(promptField()).toHaveValue(AI_PROMPT)
  })

  it('returns to the composer when the stored session expired', async () => {
    storeAiSession()
    stubApi({
      [SESSION_ROUTE]: () =>
        jsonResponse(
          { statusCode: 404, code: 'AI_SESSION_NOT_FOUND', message: 'Not found' },
          404,
        ),
    })
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('This request expired. Submit it again.')
    expect(promptField()).toHaveValue(AI_PROMPT)
    expect(sessionStorage.getItem('blendify.aiSession')).toBeNull()
  })

  it('checks a generation that kept running after a refresh until it finishes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    storeAiSession()
    const states = [generatingAiSessionState(), generatedAiSessionState()]
    const { calls } = stubApi({ [SESSION_ROUTE]: () => jsonResponse(states.shift() ?? states[0]) })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Creating your playlist…' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Create playlist' })).toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })

    await screen.findByRole('heading', { name: 'Blendify · Mix · Radiohead + Interpol' })
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      `GET /api/ai/sessions/${AI_SESSION_ID}`,
      `GET /api/ai/sessions/${AI_SESSION_ID}`,
    ])
  })

  it('starts over without any request and forgets the stored session', async () => {
    const user = userEvent.setup()
    storeAiSession()
    const { calls } = stubApi({ [SESSION_ROUTE]: () => jsonResponse(generatedAiSessionState()) })
    renderPage()
    await screen.findByRole('heading', { name: 'Blendify · Mix · Radiohead + Interpol' })

    await user.click(screen.getByRole('button', { name: 'Start over' }))

    expect(promptField()).toHaveValue('')
    expect(promptField()).toHaveFocus()
    expect(sessionStorage.getItem('blendify.aiSession')).toBeNull()
    expect(calls).toHaveLength(1)
  })

  it('cancels editing a generated request and keeps the playlist', async () => {
    const user = userEvent.setup()
    storeAiSession()
    stubApi({ [SESSION_ROUTE]: () => jsonResponse(generatedAiSessionState()) })
    renderPage()
    await screen.findByRole('heading', { name: 'Blendify · Mix · Radiohead + Interpol' })

    await user.click(screen.getByRole('button', { name: 'Edit request' }))
    expect(promptField()).toHaveValue(AI_PROMPT)
    await user.click(screen.getByRole('button', { name: 'Cancel editing' }))

    expect(screen.getByRole('heading', { name: 'Blendify · Mix · Radiohead + Interpol' })).toBeVisible()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit request' })).toHaveFocus())
  })
})

describe('Create with AI playlist title', () => {
  const SUGGESTED = 'Blendify · Mix · Radiohead + Interpol'

  function titleField() {
    return screen.getByRole('textbox', { name: 'Playlist title' })
  }

  it('shows the deterministic title once and renames it inline without any request', async () => {
    const user = userEvent.setup()
    storeAiSession()
    const { calls } = stubApi({ [SESSION_ROUTE]: () => jsonResponse(generatedAiSessionState()) })
    renderPage()
    await screen.findByRole('heading', { name: SUGGESTED })

    expect(screen.getAllByText(SUGGESTED)).toHaveLength(1)
    expect(screen.queryByRole('textbox', { name: 'Playlist title' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Edit title' }))

    expect(titleField()).toHaveFocus()
    expect(titleField()).toHaveValue(SUGGESTED)
    expect(titleField()).toHaveAttribute('maxlength', '100')
    expect(screen.queryByRole('heading', { name: SUGGESTED })).toBeNull()

    await user.clear(titleField())
    await user.type(titleField(), 'Night drive{Enter}')

    expect(screen.queryByRole('textbox', { name: 'Playlist title' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Night drive' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Edit title' })).toHaveFocus()
    expect(screen.getByText('Song 1')).toBeVisible()
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      `GET /api/ai/sessions/${AI_SESSION_ID}`,
    ])
    expect(JSON.parse(sessionStorage.getItem('blendify.aiSession') ?? '{}')).toMatchObject({
      sessionId: AI_SESSION_ID,
      playlistTitle: 'Night drive',
    })
  })

  it('finishes editing with the Done button', async () => {
    const user = userEvent.setup()
    storeAiSession()
    stubApi({ [SESSION_ROUTE]: () => jsonResponse(generatedAiSessionState()) })
    renderPage()
    await screen.findByRole('heading', { name: SUGGESTED })

    await user.click(screen.getByRole('button', { name: 'Edit title' }))
    await user.type(titleField(), ' II')
    await user.click(screen.getByRole('button', { name: 'Done' }))

    expect(screen.getByRole('heading', { name: `${SUGGESTED} II` })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Edit title' })).toHaveFocus()
  })

  it('falls back to the suggested title when the field is left empty', async () => {
    const user = userEvent.setup()
    storeAiSession()
    stubApi({ [SESSION_ROUTE]: () => jsonResponse(generatedAiSessionState()) })
    renderPage()
    await screen.findByRole('heading', { name: SUGGESTED })

    await user.click(screen.getByRole('button', { name: 'Edit title' }))
    await user.clear(titleField())
    await user.tab()
    expect(titleField()).toHaveValue(SUGGESTED)

    await user.clear(titleField())
    await user.keyboard('{Escape}')

    expect(screen.getByRole('heading', { name: SUGGESTED })).toBeVisible()
    expect(JSON.parse(sessionStorage.getItem('blendify.aiSession') ?? '{}')).toMatchObject({
      playlistTitle: null,
    })
  })

  it('keeps an edited title after a refresh', async () => {
    const user = userEvent.setup()
    storeAiSession(AI_PROMPT, 'Night drive')
    stubApi({ [SESSION_ROUTE]: () => jsonResponse(generatedAiSessionState()) })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Night drive' })).toBeVisible()
    expect(screen.queryByText(SUGGESTED)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Edit title' }))
    expect(titleField()).toHaveValue('Night drive')
  })

  it('does not carry an edited title into a new session or past Start over', async () => {
    const user = userEvent.setup()
    storeAiSession(AI_PROMPT, 'Night drive')
    stubApi({
      [SESSION_ROUTE]: () => jsonResponse(generatedAiSessionState()),
      [CREATE_ROUTE]: () => jsonResponse({ ...reviewedAiSession(), sessionId: 'next-session' }, 201),
    })
    renderPage()
    await screen.findByRole('heading', { name: 'Night drive' })

    await user.click(screen.getByRole('button', { name: 'Edit request' }))
    await user.click(screen.getByRole('button', { name: 'Review request' }))
    await screen.findByRole('heading', { name: 'Here’s what Blendify understood' })

    expect(JSON.parse(sessionStorage.getItem('blendify.aiSession') ?? '{}')).toEqual({
      sessionId: 'next-session',
      prompt: AI_PROMPT,
      playlistTitle: null,
    })

    await user.click(screen.getByRole('button', { name: 'Start over' }))
    expect(sessionStorage.getItem('blendify.aiSession')).toBeNull()
  })
})

describe('Create with AI generation copy', () => {
  it.each([
    {
      locale: 'es',
      create: 'Crear playlist',
      hint: 'Blendify creará una vista previa de tu playlist.',
      eyebrow: 'Vista previa de la playlist',
      unmetTitle: 'Algunas preferencias no se pudieron aplicar del todo',
      context: 'El pedido con el que se creó esta vista previa.',
      editTitle: 'Editar título',
      titleLabel: 'Título de la playlist',
      done: 'Listo',
    },
    {
      locale: 'pt',
      create: 'Criar playlist',
      hint: 'O Blendify vai criar uma prévia da sua playlist.',
      eyebrow: 'Prévia da playlist',
      unmetTitle: 'Algumas preferências não puderam ser aplicadas por completo',
      context: 'O pedido usado para criar esta prévia.',
      editTitle: 'Editar título',
      titleLabel: 'Título da playlist',
      done: 'Concluir',
    },
  ] as const)('renders the generation flow in $locale', async (copy) => {
    const user = userEvent.setup()
    storeAiSession()
    stubApi({
      [SESSION_ROUTE]: () => jsonResponse(reviewedAiSessionState()),
      [GENERATE_ROUTE]: () =>
        ndjsonResponse({
          type: 'result',
          playlist: aiGeneration({
            tracks: aiTracks(16),
            unmetConstraints: [{ type: 'track_count', requested: 20, actual: 16 }],
          }),
        }),
    })
    renderPage()
    act(() => {
      useLocaleStore.getState().setLocale(copy.locale)
    })

    expect(await screen.findByText(copy.hint)).toBeVisible()
    await user.click(screen.getByRole('button', { name: copy.create }))

    expect(await screen.findByText(copy.eyebrow)).toBeVisible()
    expect(screen.getByRole('heading', { name: copy.unmetTitle })).toBeVisible()
    expect(screen.getByText(copy.context)).toBeVisible()
    await user.click(screen.getByRole('button', { name: copy.editTitle }))
    expect(screen.getByRole('textbox', { name: copy.titleLabel })).toHaveFocus()
    expect(screen.getByRole('button', { name: copy.done })).toBeVisible()
    expectNoRawIdentifiers()
  })
})
