import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AiRefinementDto } from '@blendify/contracts'
import {
  jsonResponse,
  renderWithProviders,
  setAuthState,
  stubApi,
  testUser,
  type FetchCall,
} from '@/test/app-harness'
import {
  AI_REFINEMENT_ID,
  AI_SESSION_ID,
  appliedCandidateState,
  candidateReadyRefinement,
  generatedAiSessionState,
  pendingAiSessionState,
  storeAiSession,
} from '@/test/ai-session-fixtures'
import { AiPlaylistPage } from './ai-playlist-page'

const SESSION_ROUTE = `GET /api/ai/sessions/${AI_SESSION_ID}`
const REFINE_ROUTE = `POST /api/ai/sessions/${AI_SESSION_ID}/refinements`
const APPLY_ROUTE = `POST /api/ai/sessions/${AI_SESSION_ID}/refinements/${AI_REFINEMENT_ID}/apply`
const DISMISS_ROUTE = `POST /api/ai/sessions/${AI_SESSION_ID}/refinements/${AI_REFINEMENT_ID}/dismiss`
const SUGGESTED_TITLE = 'Blendify · Mix · Radiohead + Interpol'

function refinementResult(refinement: AiRefinementDto) {
  return jsonResponse({
    sessionId: AI_SESSION_ID,
    expiresAt: '2026-09-27T12:30:00.000Z',
    refinement,
  })
}

function apiError(status: number, code: string) {
  return jsonResponse({ statusCode: status, code, message: 'server detail' }, status)
}

function refinementCalls(calls: FetchCall[]) {
  return calls.filter((call) => call.url.includes('/refinements'))
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function renderPage(
  routes: Parameters<typeof stubApi>[0],
  options: { title?: string | null; state?: ReturnType<typeof generatedAiSessionState> } = {},
) {
  storeAiSession(undefined, options.title ?? null)
  const stub = stubApi({
    [SESSION_ROUTE]: () => jsonResponse(options.state ?? generatedAiSessionState()),
    ...routes,
  })
  renderWithProviders(<AiPlaylistPage />, { route: '/app/ai' })
  await screen.findByRole('heading', { name: options.title ?? SUGGESTED_TITLE })
  return stub
}

async function openComposer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Refine playlist' }))
  return screen.getByRole('textbox', { name: 'What would you like to change?' })
}

beforeEach(() => {
  sessionStorage.clear()
  setAuthState(null)
})

afterEach(() => {
  sessionStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Create with AI refinement', () => {
  it('offers Refine playlist next to the destination and opens a focused, labelled composer', async () => {
    const user = userEvent.setup()
    await renderPage({})

    expect(screen.getByRole('button', { name: 'Prepare transfer' })).toBeInTheDocument()
    const textarea = await openComposer(user)

    expect(textarea).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Propose changes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Make it less mainstream' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('textbox', { name: 'What would you like to change?' })).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refine playlist' })).toHaveFocus())
  })

  it('hides Refine playlist once the playlist has a destination', async () => {
    await renderPage(
      {},
      {
        state: generatedAiSessionState(undefined, {
          status: 'transfer_prepared',
          transfer: {
            url: 'https://soundiiz.com/go/import-playlist/abcdefghijklmnop',
            expiresAt: '2099-01-01T00:00:00.000Z',
            trackCount: 20,
          },
        }),
      },
    )

    expect(screen.queryByRole('button', { name: 'Refine playlist' })).toBeNull()
  })

  it('sends only the refinement text once, keeps the current playlist visible and blocks destinations while refining', async () => {
    const user = userEvent.setup()
    const response = deferred<Response>()
    const { calls } = await renderPage({ [REFINE_ROUTE]: () => response.promise })
    const textarea = await openComposer(user)

    await user.click(screen.getByRole('button', { name: 'Propose changes' }))
    expect(screen.getByText('Describe what you’d like to change first.')).toBeInTheDocument()
    expect(refinementCalls(calls)).toHaveLength(0)

    await user.type(textarea, 'Make it more popular')
    const submit = screen.getByRole('button', { name: 'Propose changes' })
    await user.click(submit)
    await user.click(submit)

    expect(screen.getByRole('button', { name: 'Refining playlist…' })).toBeDisabled()
    expect(screen.getAllByText('Refining playlist…').length).toBeGreaterThan(0)
    expect(screen.getByRole('list', { name: 'Songs in this playlist' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: SUGGESTED_TITLE })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Prepare transfer' })).toBeNull()
    expect(
      screen.getByText('Finish or dismiss the current refinement before saving this playlist.'),
    ).toBeInTheDocument()
    expect(refinementCalls(calls)).toEqual([
      expect.objectContaining({ method: 'POST', body: { refinement: 'Make it more popular' } }),
    ])

    response.resolve(refinementResult(candidateReadyRefinement()))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Proposed changes' })).toHaveFocus(),
    )
  })

  it('shows the proposed changes and applies them without changing the edited title', async () => {
    const user = userEvent.setup()
    const { calls } = await renderPage(
      {
        [REFINE_ROUTE]: () => refinementResult(candidateReadyRefinement()),
        [APPLY_ROUTE]: () => jsonResponse(appliedCandidateState()),
      },
      { title: 'Night run' },
    )
    const textarea = await openComposer(user)
    await user.type(textarea, 'Make it more popular')
    await user.click(screen.getByRole('button', { name: 'Propose changes' }))

    const review = (await screen.findByRole('heading', { name: 'Proposed changes' })).closest(
      'section',
    ) as HTMLElement
    expect(within(review).getByText('Familiarity')).toBeInTheDocument()
    expect(within(review).getByText('Deep cuts')).toBeInTheDocument()
    expect(within(review).getByText('Popular')).toBeInTheDocument()
    expect(within(review).getByText('Replacements')).toBeInTheDocument()
    expect(within(review).getByText('“more energetic”')).toBeInTheDocument()
    const proposedList = within(review).getByRole('list', {
      name: 'Songs in the proposed playlist',
    })
    expect(within(proposedList).getAllByText('Kept')).toHaveLength(2)
    await user.click(within(review).getByRole('button', { name: 'Show all 20 songs' }))
    expect(within(proposedList).getAllByText('Added')).toHaveLength(2)
    expect(screen.queryByRole('list', { name: 'Songs in this playlist' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Prepare transfer' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Refine playlist' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Apply changes' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Night run' })).toHaveFocus())
    expect(screen.queryByRole('heading', { name: 'Proposed changes' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Prepare transfer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refine playlist' })).toBeInTheDocument()
    expect(screen.getAllByText('Changes applied. This is now your current playlist.').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Show all 20 songs' }))
    expect(screen.getByText('Proposed 1')).toBeInTheDocument()
    const apply = calls.find((call) => call.url.endsWith('/apply'))
    expect(apply).toMatchObject({ method: 'POST', body: undefined })
    expect(JSON.parse(sessionStorage.getItem('blendify.aiSession') ?? '{}')).toMatchObject({
      playlistTitle: 'Night run',
    })
  })

  it('discards the proposal on Cancel and keeps the current playlist', async () => {
    const user = userEvent.setup()
    const { calls } = await renderPage(
      { [DISMISS_ROUTE]: () => jsonResponse(generatedAiSessionState()) },
      { state: pendingAiSessionState(candidateReadyRefinement()) },
    )

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Refine playlist' })).toHaveFocus())
    await user.click(screen.getByRole('button', { name: 'Show all 20 songs' }))
    expect(screen.getByText('Song 20')).toBeInTheDocument()
    expect(screen.queryByText('Proposed 1')).toBeNull()
    expect(screen.getByRole('button', { name: 'Prepare transfer' })).toBeInTheDocument()
    expect(calls.filter((call) => call.url.endsWith('/dismiss'))).toHaveLength(1)
  })

  it('restores a pending candidate without submitting, applying or dismissing anything', async () => {
    const { calls } = await renderPage(
      {},
      { state: pendingAiSessionState(candidateReadyRefinement()) },
    )

    expect(screen.getByRole('heading', { name: 'Proposed changes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply changes' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Prepare transfer' })).toBeNull()
    expect(refinementCalls(calls)).toHaveLength(0)
  })

  it('applies with a synchronous guard against double clicks', async () => {
    const user = userEvent.setup()
    const response = deferred<Response>()
    const { calls } = await renderPage(
      { [APPLY_ROUTE]: () => response.promise },
      { state: pendingAiSessionState(candidateReadyRefinement()) },
    )

    const apply = screen.getByRole('button', { name: 'Apply changes' })
    await user.dblClick(apply)

    expect(screen.getByRole('button', { name: 'Applying changes…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(calls.filter((call) => call.url.endsWith('/apply'))).toHaveLength(1)
    response.resolve(jsonResponse(appliedCandidateState()))
    await screen.findByRole('button', { name: 'Refine playlist' })
  })

  it('reloads the session and explains a stale proposal instead of applying it', async () => {
    const user = userEvent.setup()
    let reads = 0
    const newer = candidateReadyRefinement('refinement-2')
    const { calls } = await renderPage(
      {
        [SESSION_ROUTE]: () => {
          reads += 1
          return jsonResponse(
            pendingAiSessionState(reads === 1 ? candidateReadyRefinement() : newer),
          )
        },
        [APPLY_ROUTE]: () => apiError(409, 'AI_REFINEMENT_STALE'),
      },
    )

    await user.click(screen.getByRole('button', { name: 'Apply changes' }))

    expect(
      await screen.findByText(
        'That proposal is no longer current. Blendify loaded the latest version of your playlist.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(reads).toBe(2))
    expect(calls.filter((call) => call.url.includes('refinement-2'))).toHaveLength(0)
  })

  it('loads the pending refinement another tab created instead of replacing it', async () => {
    const user = userEvent.setup()
    let reads = 0
    const { calls } = await renderPage({
      [SESSION_ROUTE]: () => {
        reads += 1
        return jsonResponse(
          reads === 1 ? generatedAiSessionState() : pendingAiSessionState(candidateReadyRefinement()),
        )
      },
      [REFINE_ROUTE]: () => apiError(409, 'AI_REFINEMENT_PENDING'),
    })

    const textarea = await openComposer(user)
    await user.type(textarea, 'Make it less mainstream')
    await user.click(screen.getByRole('button', { name: 'Propose changes' }))

    expect(await screen.findByRole('heading', { name: 'Proposed changes' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'Another change to this playlist is waiting for your review. Apply or dismiss it before refining again.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply changes' })).toBeEnabled()
    expect(screen.queryByRole('textbox', { name: 'What would you like to change?' })).toBeNull()
    expect(reads).toBe(2)
    expect(refinementCalls(calls)).toHaveLength(1)
  })

  it.each([
    [
      'a preserved artist missing from the playlist',
      {
        id: AI_REFINEMENT_ID,
        status: 'needs_clarification',
        clarification: {
          reason: 'preserved_artist_not_found',
          seedType: null,
          limit: null,
          names: ['Björk'],
          unsupportedConstraints: [],
        },
      } satisfies AiRefinementDto,
      'There are no songs by Björk in the current playlist to keep.',
    ],
    [
      'conflicting changes',
      {
        id: AI_REFINEMENT_ID,
        status: 'needs_clarification',
        clarification: {
          reason: 'conflicting_changes',
          seedType: null,
          limit: null,
          names: ['Coldplay'],
          unsupportedConstraints: [],
        },
      } satisfies AiRefinementDto,
      'These changes contradict each other or the songs you’re keeping: Coldplay.',
    ],
  ])('explains %s and lets the user try a different refinement', async (_label, refinement, message) => {
    const user = userEvent.setup()
    const { calls } = await renderPage({
      [REFINE_ROUTE]: () => refinementResult(refinement),
      [DISMISS_ROUTE]: () => jsonResponse(generatedAiSessionState()),
    })
    const textarea = await openComposer(user)
    await user.type(textarea, 'Keep the Björk songs')
    await user.click(screen.getByRole('button', { name: 'Propose changes' }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'This change needs another try' })).toHaveFocus(),
    )
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apply changes' })).toBeNull()
    expect(screen.getByRole('list', { name: 'Songs in this playlist' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try a different refinement' }))

    const reopened = await screen.findByRole('textbox', { name: 'What would you like to change?' })
    await waitFor(() => expect(reopened).toHaveFocus())
    expect(reopened).toHaveValue('Keep the Björk songs')
    expect(calls.filter((call) => call.url.endsWith('/dismiss'))).toHaveLength(1)
  })

  it('reports an unchanged refinement and continues with the current playlist', async () => {
    const user = userEvent.setup()
    const { calls } = await renderPage(
      { [DISMISS_ROUTE]: () => jsonResponse(generatedAiSessionState()) },
      { state: pendingAiSessionState({ id: AI_REFINEMENT_ID, status: 'unchanged' }) },
    )

    expect(screen.getByRole('heading', { name: 'No changes needed' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apply changes' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Continue with current playlist' }))

    await screen.findByRole('button', { name: 'Prepare transfer' })
    expect(calls.filter((call) => call.url.endsWith('/dismiss'))).toHaveLength(1)
  })

  it('explains a failed candidate and dismisses it', async () => {
    const user = userEvent.setup()
    const candidate = candidateReadyRefinement()
    await renderPage(
      { [DISMISS_ROUTE]: () => jsonResponse(generatedAiSessionState()) },
      {
        state: pendingAiSessionState({
          id: AI_REFINEMENT_ID,
          status: 'candidate_failed',
          intent: candidate.intent,
          preservation: candidate.preservation,
          notApplied: [],
          error: {
            code: 'SPOTIFY_RATE_LIMITED',
            category: 'provider_rate_limited',
            retryAfterSeconds: 30,
            seedNotFound: null,
          },
        }),
      },
    )

    expect(screen.getByRole('heading', { name: 'Couldn’t prepare these changes' })).toBeInTheDocument()
    expect(screen.getByText(/Spotify is temporarily limiting requests/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apply changes' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    await screen.findByRole('button', { name: 'Refine playlist' })
  })

  it('keeps selected positions as bounded changes and marks earlier kept songs as read-only', async () => {
    const user = userEvent.setup()
    const state = {
      ...generatedAiSessionState(),
      preservation: {
        firstTracks: 1,
        positions: [3],
        artists: [],
        preservedPositions: [1, 3],
      },
    }
    const { calls } = await renderPage(
      { [REFINE_ROUTE]: () => refinementResult({ id: AI_REFINEMENT_ID, status: 'unchanged' }) },
      { state },
    )
    const textarea = await openComposer(user)

    expect(screen.getByText('Songs already kept in place: 1')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Keep “Song 1” in place' })).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Keep “Song 3” in place' })).toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: 'Keep “Song 2” in place' }))
    await user.click(screen.getByRole('checkbox', { name: 'Keep “Song 3” in place' }))
    await user.type(textarea, 'More popular')
    await user.click(screen.getByRole('button', { name: 'Propose changes' }))

    await screen.findByRole('heading', { name: 'No changes needed' })
    expect(refinementCalls(calls)[0].body).toEqual({
      refinement: 'More popular',
      preservePositions: { add: [2], remove: [3] },
    })
  })

  it('refreshes the session when a stale tab tries to publish during a refinement', async () => {
    setAuthState(testUser)
    const user = userEvent.setup()
    let reads = 0
    await renderPage({
      [SESSION_ROUTE]: () => {
        reads += 1
        return jsonResponse(
          reads === 1
            ? generatedAiSessionState()
            : pendingAiSessionState(candidateReadyRefinement()),
        )
      },
      [`POST /api/ai/sessions/${AI_SESSION_ID}/publish`]: () =>
        apiError(409, 'AI_REFINEMENT_PENDING'),
    })

    await user.click(screen.getByRole('button', { name: 'Save to Spotify' }))

    expect(await screen.findByRole('heading', { name: 'Proposed changes' })).toBeInTheDocument()
    expect(
      screen.getByText('Finish or dismiss the current refinement before saving this playlist.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save to Spotify' })).toBeNull()
  })

  it('abandons the whole session on Start over without settling the pending refinement', async () => {
    const user = userEvent.setup()
    const { calls } = await renderPage(
      {},
      { state: pendingAiSessionState(candidateReadyRefinement()) },
    )

    await user.click(screen.getByRole('button', { name: 'Start over' }))

    expect(await screen.findByRole('textbox', { name: 'Playlist request' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Proposed changes' })).toBeNull()
    expect(sessionStorage.getItem('blendify.aiSession')).toBeNull()
    expect(refinementCalls(calls)).toHaveLength(0)
  })
})
