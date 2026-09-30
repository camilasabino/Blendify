import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AiSessionDto } from '@blendify/contracts'
import { useLocaleStore } from '@/i18n/use-locale'
import { jsonResponse, renderWithProviders, stubApi, type FetchCall } from '@/test/app-harness'
import { AiPlaylistPage } from './ai-playlist-page'

const PROMPT = '30 deep cuts from Radiohead and Interpol, no Coldplay'
const EXPIRES_AT = '2026-09-27T12:30:00.000Z'

function createdSession(session: AiSessionDto) {
  return { ...session, accessKey: 'access-key' }
}

const READY_SESSION: AiSessionDto = {
  sessionId: 'session-id',
  expiresAt: EXPIRES_AT,
  status: 'ready',
  intent: {
    kind: 'artist_mix',
    artists: ['Radiohead', 'Interpol'],
    genres: [],
    seedTrack: null,
    targetTrackCount: 30,
    targetDurationMinutes: null,
    mood: null,
    popularity: 'rarities',
    orderMode: null,
    excludeArtists: ['Coldplay'],
    excludeTracks: [],
    unmetConstraints: [{ category: 'mood', userText: 'rainy afternoon' }],
  },
  clarification: null,
}

const CLARIFICATION_SESSION: AiSessionDto = {
  sessionId: 'session-id',
  expiresAt: EXPIRES_AT,
  status: 'needs_clarification',
  intent: null,
  clarification: {
    reason: 'too_many_seeds',
    seedType: 'artist',
    limit: 1,
    names: ['Radiohead', 'Interpol'],
    unsupportedConstraints: [],
    options: [
      { id: 'keep_seed:artist:0', type: 'keep_seed', seedType: 'artist', label: 'Radiohead' },
      { id: 'keep_seed:artist:1', type: 'keep_seed', seedType: 'artist', label: 'Interpol' },
      { id: 'set_kind:artist_mix', type: 'set_kind', kind: 'artist_mix' },
    ],
  },
}

function renderPage() {
  return renderWithProviders(<AiPlaylistPage />, { route: '/app/ai' })
}

function promptField() {
  return screen.getByRole('textbox', { name: 'Playlist request' })
}

function queryPromptField() {
  return screen.queryByRole('textbox', { name: 'Playlist request' })
}

function expectNoGenerationAction() {
  expect(screen.queryByRole('button', { name: /create playlist/i })).toBeNull()
}

function sessionCalls(calls: FetchCall[]) {
  return calls.filter((call) => call.url.startsWith('/api/ai/sessions'))
}

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  sessionStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Create with AI page', () => {
  it('shows the empty prompt state with a labelled textarea and examples', () => {
    stubApi({})
    renderPage()

    expect(
      screen.getByRole('heading', { level: 1, name: 'Describe the playlist you want' }),
    ).toBeVisible()
    expect(promptField()).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Review request' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Music similar to Björk' })).toBeVisible()
  })

  it('fills the prompt from an example without submitting it', async () => {
    const user = userEvent.setup()
    const { calls } = stubApi({})
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Music similar to Björk' }))

    expect(promptField()).toHaveValue('Music similar to Björk')
    expect(promptField()).toHaveFocus()
    expect(sessionCalls(calls)).toEqual([])
  })

  it('asks for a request before submitting an empty prompt', async () => {
    const user = userEvent.setup()
    const { calls } = stubApi({})
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Review request' }))

    expect(screen.getByText('Describe the playlist you want first.')).toBeVisible()
    expect(promptField()).toHaveAttribute('aria-invalid', 'true')
    expect(sessionCalls(calls)).toEqual([])
  })

  it('shows a single in-flight interpretation and then the understood intent', async () => {
    const user = userEvent.setup()
    let respond: (response: Response) => void = () => undefined
    const { calls } = stubApi({
      'POST /api/ai/sessions': () =>
        new Promise<Response>((resolve) => {
          respond = resolve
        }),
    })
    renderPage()

    await user.type(promptField(), PROMPT)
    await user.click(screen.getByRole('button', { name: 'Review request' }))

    const busyButton = screen.getByRole('button', { name: 'Reading your request…' })
    expect(busyButton).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Reading your request…')
    await user.keyboard('{Control>}{Enter}{/Control}')
    expect(sessionCalls(calls)).toEqual([
      { url: '/api/ai/sessions', method: 'POST', body: { prompt: PROMPT } },
    ])

    await act(async () => {
      respond(jsonResponse(createdSession(READY_SESSION), 201))
    })

    const heading = await screen.findByRole('heading', {
      name: 'Here’s what Blendify understood',
    })
    await waitFor(() => expect(heading).toHaveFocus())
    const summary = heading.closest('section') as HTMLElement
    expect(within(summary).getByText('Radiohead · Interpol')).toBeVisible()
    expect(within(summary).getByText('Lesser-known')).toBeVisible()
    expect(within(summary).getByText('Coldplay')).toBeVisible()
    expect(within(summary).getByText('Not used')).toBeVisible()
    expect(within(summary).getByText(/rainy afternoon/)).toBeVisible()
    expect(within(summary).queryByRole('button', { name: 'Edit request' })).toBeNull()
    expect(within(summary).getByRole('button', { name: 'Start over' })).toBeEnabled()
    expect(within(summary).getByRole('button', { name: 'Create preview' })).toBeEnabled()
    expect(
      within(summary).getByText('Blendify will create a preview of your playlist.'),
    ).toBeVisible()
    expect(
      within(summary).getByText('Check these settings. Edit your request if something is off.'),
    ).toBeVisible()
    expect(sessionCalls(calls)).toHaveLength(1)

    expect(queryPromptField()).toBeNull()
    expect(screen.queryByRole('button', { name: 'Music similar to Björk' })).toBeNull()
    expect(
      screen.queryByText(
        'Name artists, a song or genres, and add details like size, familiarity or songs to avoid. Blendify shows what it understood before building anything.',
      ),
    ).toBeNull()

    const requestCard = screen
      .getByRole('heading', { name: 'Your request' })
      .closest('section') as HTMLElement
    expect(within(requestCard).getByText(`“${PROMPT}”`)).toBeVisible()
    const editButton = within(requestCard).getByRole('button', { name: 'Edit request' })
    expect(editButton).toBeEnabled()
  })

  it('shows a reviewed mood and target duration without any seed', async () => {
    const user = userEvent.setup()
    stubApi({
      'POST /api/ai/sessions': () =>
        jsonResponse(
          {
            ...createdSession(READY_SESSION),
            intent: {
              ...READY_SESSION.intent,
              kind: 'genre_mix',
              artists: [],
              targetTrackCount: null,
              targetDurationMinutes: 60,
              mood: 'happy',
              popularity: null,
              excludeArtists: [],
              unmetConstraints: [{ category: 'activity', userText: 'to dance at a party' }],
            },
          },
          201,
        ),
    })
    renderPage()

    await user.type(promptField(), 'Happy music to dance at a party, for an hour')
    await user.click(screen.getByRole('button', { name: 'Review request' }))

    const heading = await screen.findByRole('heading', {
      name: 'Here’s what Blendify understood',
    })
    const summary = heading.closest('section') as HTMLElement
    expect(within(summary).getByText('Happy')).toBeVisible()
    expect(within(summary).getByText('About 60 min')).toBeVisible()
    expect(within(summary).getByText(/to dance at a party/)).toBeVisible()
    expect(within(summary).getByRole('button', { name: 'Create preview' })).toBeEnabled()
  })

  it.each([
    ['angry', 'Angry'],
    ['nostalgic', 'Nostalgic'],
    ['dreamy', 'Dreamy'],
  ] as const)('shows the %s mood with its localized label', async (mood, label) => {
    const user = userEvent.setup()
    stubApi({
      'POST /api/ai/sessions': () =>
        jsonResponse(
          {
            ...createdSession(READY_SESSION),
            intent: {
              ...READY_SESSION.intent,
              kind: 'genre_mix',
              artists: [],
              mood,
              excludeArtists: [],
              unmetConstraints: [],
            },
          },
          201,
        ),
    })
    renderPage()

    await user.type(promptField(), `Something ${mood}`)
    await user.click(screen.getByRole('button', { name: 'Review request' }))

    const heading = await screen.findByRole('heading', {
      name: 'Here’s what Blendify understood',
    })
    const summary = heading.closest('section') as HTMLElement
    expect(within(summary).getByText(label)).toBeVisible()
    expect(within(summary).queryByText(mood)).toBeNull()
  })

  it('submits with Ctrl+Enter but keeps Enter for new lines', async () => {
    const user = userEvent.setup()
    const { calls } = stubApi({
      'POST /api/ai/sessions': () => jsonResponse(createdSession(READY_SESSION), 201),
    })
    renderPage()

    expect(screen.getByText('Press Ctrl+Enter or ⌘+Enter to submit.')).toHaveClass(
      'max-sm:hidden',
      'pointer-coarse:hidden',
    )
    await user.type(promptField(), 'Radiohead{Enter}deep cuts')
    expect(sessionCalls(calls)).toEqual([])

    await user.keyboard('{Control>}{Enter}{/Control}')

    await screen.findByRole('heading', { name: 'Here’s what Blendify understood' })
    expect(sessionCalls(calls)[0].body).toEqual({ prompt: 'Radiohead\ndeep cuts' })
  })

  it('focuses a clarification and applies the chosen option', async () => {
    const user = userEvent.setup()
    const { calls } = stubApi({
      'POST /api/ai/sessions': () => jsonResponse(createdSession(CLARIFICATION_SESSION), 201),
      'POST /api/ai/sessions/session-id/clarification': () =>
        jsonResponse(READY_SESSION),
    })
    renderPage()

    await user.type(promptField(), 'Music like Radiohead and Interpol')
    await user.click(screen.getByRole('button', { name: 'Review request' }))

    const heading = await screen.findByRole('heading', { name: 'One thing to confirm' })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(
      screen.getByText('Discover starts from one artist. Choose one, or mix them instead.'),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Mix these artists instead' })).toBeVisible()
    expectNoGenerationAction()

    await user.click(screen.getByRole('button', { name: 'Start from Interpol' }))

    await screen.findByRole('heading', { name: 'Here’s what Blendify understood' })
    expect(sessionCalls(calls).at(-1)).toEqual({
      url: '/api/ai/sessions/session-id/clarification',
      method: 'POST',
      body: { optionId: 'keep_seed:artist:1' },
    })
  })

  it('shows the submitted request, not an unsent draft, after a clarification resolves', async () => {
    const user = userEvent.setup()
    const submitted = 'Music like Radiohead and Interpol'
    stubApi({
      'POST /api/ai/sessions': () => jsonResponse(createdSession(CLARIFICATION_SESSION), 201),
      'POST /api/ai/sessions/session-id/clarification': () => jsonResponse(READY_SESSION),
    })
    renderPage()

    await user.type(promptField(), submitted)
    await user.click(screen.getByRole('button', { name: 'Review request' }))
    await screen.findByRole('heading', { name: 'One thing to confirm' })

    await user.type(promptField(), ', drop the mellow tracks')
    await user.click(screen.getByRole('button', { name: 'Start from Interpol' }))

    await screen.findByRole('heading', { name: 'Here’s what Blendify understood' })
    const requestCard = screen
      .getByRole('heading', { name: 'Your request' })
      .closest('section') as HTMLElement
    expect(within(requestCard).getByText(`“${submitted}”`)).toBeVisible()
    expect(within(requestCard).queryByText(/drop the mellow tracks/)).toBeNull()
  })

  it('announces a recoverable AI error and keeps the prompt for another try', async () => {
    const user = userEvent.setup()
    stubApi({
      'POST /api/ai/sessions': () =>
        jsonResponse(
          {
            statusCode: 503,
            code: 'AI_UNAVAILABLE',
            message: 'Create with AI is temporarily unavailable. Try again shortly.',
          },
          503,
        ),
    })
    renderPage()

    await user.type(promptField(), PROMPT)
    await user.click(screen.getByRole('button', { name: 'Review request' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Create with AI is temporarily unavailable. Mix and Discover still work.',
    )
    expect(promptField()).toHaveValue(PROMPT)
    expect(promptField()).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Review request' })).toBeEnabled()
  })

  it('offers an explicit Retry after a timeout and never resubmits on its own', async () => {
    const user = userEvent.setup()
    const responses = [
      jsonResponse(
        { statusCode: 504, code: 'AI_TIMEOUT', message: 'Create with AI took too long to respond.' },
        504,
      ),
      jsonResponse(createdSession(READY_SESSION), 201),
    ]
    const { calls } = stubApi({
      'POST /api/ai/sessions': () => responses.shift() ?? jsonResponse({}, 500),
    })
    renderPage()

    await user.type(promptField(), PROMPT)
    await user.click(screen.getByRole('button', { name: 'Review request' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Reading your request took too long. Try again.',
    )
    expect(screen.getByRole('alert')).not.toHaveTextContent(/too long to respond|504/)
    expect(sessionCalls(calls)).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    await screen.findByRole('heading', { name: 'Here’s what Blendify understood' })
    expect(sessionCalls(calls).map((call) => call.body)).toEqual([
      { prompt: PROMPT },
      { prompt: PROMPT },
    ])
  })

  it.each([
    ['AI_INVALID_OUTPUT', 502, 'Blendify couldn’t read your request this time. Try again, or rephrase it.'],
    ['AI_RATE_LIMITED', 429, 'Create with AI is busy right now. Try again in a moment.'],
  ] as const)('keeps %s recoverable with a Retry action', async (code, status, message) => {
    const user = userEvent.setup()
    stubApi({
      'POST /api/ai/sessions': () => jsonResponse({ statusCode: status, code, message: 'raw' }, status),
    })
    renderPage()

    await user.type(promptField(), PROMPT)
    await user.click(screen.getByRole('button', { name: 'Review request' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
    expect(promptField()).toHaveValue(PROMPT)
  })

  it('asks to rephrase a rejected request instead of offering Retry', async () => {
    const user = userEvent.setup()
    stubApi({
      'POST /api/ai/sessions': () =>
        jsonResponse({ statusCode: 400, code: 'AI_REQUEST_REJECTED', message: 'raw' }, 400),
    })
    renderPage()

    await user.type(promptField(), PROMPT)
    await user.click(screen.getByRole('button', { name: 'Review request' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Blendify can’t use this request as written. Try rephrasing it.',
    )
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(promptField()).toHaveFocus()
  })

  it('moves back to the prompt from a clarification without options', async () => {
    const user = userEvent.setup()
    stubApi({
      'POST /api/ai/sessions': () =>
        jsonResponse(
          createdSession({
            ...CLARIFICATION_SESSION,
            clarification: {
              reason: 'unknown_genres',
              seedType: 'genre',
              limit: null,
              names: ['glitter punk'],
              unsupportedConstraints: [],
              options: [],
            },
          }),
          201,
        ),
    })
    renderPage()

    await user.type(promptField(), 'Glitter punk')
    await user.click(screen.getByRole('button', { name: 'Review request' }))
    await screen.findByRole('heading', { name: 'One thing to confirm' })

    expect(screen.queryByRole('group', { name: 'Choose an option' })).toBeNull()
    expect(screen.getByText('Edit your request and submit it again.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Edit request' }))

    expect(promptField()).toHaveFocus()
    expect(promptField()).toHaveValue('Glitter punk')
  })

  it('reloads the session when a clarification choice is no longer available', async () => {
    const user = userEvent.setup()
    const { calls } = stubApi({
      'POST /api/ai/sessions': () => jsonResponse(createdSession(CLARIFICATION_SESSION), 201),
      'POST /api/ai/sessions/session-id/clarification': () =>
        jsonResponse(
          { statusCode: 409, code: 'AI_CLARIFICATION_OPTION_UNAVAILABLE', message: 'raw' },
          409,
        ),
      'GET /api/ai/sessions/session-id': () =>
        jsonResponse({
          ...READY_SESSION,
          execution: null,
          destination: null,
          preservation: null,
          refinement: null,
        }),
    })
    renderPage()

    await user.type(promptField(), 'Music like Radiohead and Interpol')
    await user.click(screen.getByRole('button', { name: 'Review request' }))
    await screen.findByRole('heading', { name: 'One thing to confirm' })
    await user.click(screen.getByRole('button', { name: 'Start from Interpol' }))

    await screen.findByRole('heading', { name: 'Here’s what Blendify understood' })
    expect(calls.some((call) => call.method === 'GET' && call.url === '/api/ai/sessions/session-id')).toBe(
      true,
    )
  })

  it('edits the request from the summary and reviews it again', async () => {
    const user = userEvent.setup()
    const { calls } = stubApi({ 'POST /api/ai/sessions': () => jsonResponse(createdSession(READY_SESSION), 201) })
    renderPage()

    await user.type(promptField(), PROMPT)
    await user.click(screen.getByRole('button', { name: 'Review request' }))
    await screen.findByRole('heading', { name: 'Here’s what Blendify understood' })

    await user.click(screen.getByRole('button', { name: 'Edit request' }))

    expect(promptField()).toHaveFocus()
    expect(promptField()).toHaveValue(PROMPT)
    expect(screen.getByRole('button', { name: 'Music similar to Björk' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Here’s what Blendify understood' })).toBeNull()

    await user.type(promptField(), ', around 40 songs')
    await user.click(screen.getByRole('button', { name: 'Review request' }))

    await screen.findByRole('heading', { name: 'Here’s what Blendify understood' })
    expect(queryPromptField()).toBeNull()
    expect(sessionCalls(calls).map((call) => call.body)).toEqual([
      { prompt: PROMPT },
      { prompt: `${PROMPT}, around 40 songs` },
    ])
  })

  it('starts over from the summary', async () => {
    const user = userEvent.setup()
    stubApi({ 'POST /api/ai/sessions': () => jsonResponse(createdSession(READY_SESSION), 201) })
    renderPage()

    await user.type(promptField(), PROMPT)
    await user.click(screen.getByRole('button', { name: 'Review request' }))
    await screen.findByRole('heading', { name: 'Here’s what Blendify understood' })

    await user.click(screen.getByRole('button', { name: 'Start over' }))

    expect(promptField()).toHaveValue('')
    expect(promptField()).toHaveFocus()
    expect(screen.queryByRole('heading', { name: 'Here’s what Blendify understood' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit request' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Music similar to Björk' })).toBeVisible()
  })

  it('wraps a long request in the compact card without truncating it', async () => {
    const user = userEvent.setup()
    const longPrompt =
      'A very long playlist request that names many artists in a row: Radiohead, Interpol, ' +
      'Boards of Canada, Grizzly Bear, Beach House, Fleet Foxes, Bon Iver, and The National, ' +
      'around fifty songs, favoring rarities over hits, and please avoid anything by Coldplay.'
    stubApi({
      'POST /api/ai/sessions': () =>
        jsonResponse(
          { ...createdSession(READY_SESSION), intent: { ...READY_SESSION.intent!, artists: [] } },
          201,
        ),
    })
    renderPage()

    await user.type(promptField(), longPrompt)
    await user.click(screen.getByRole('button', { name: 'Review request' }))

    await screen.findByRole('heading', { name: 'Here’s what Blendify understood' })
    const requestCard = screen
      .getByRole('heading', { name: 'Your request' })
      .closest('section') as HTMLElement
    expect(within(requestCard).getByText(`“${longPrompt}”`)).toBeVisible()
  })

  it.each([
    ['es', 'Describe la playlist que quieres', 'Revisar pedido', 'Pedido de playlist'],
    ['pt', 'Descreva a playlist que você quer', 'Revisar pedido', 'Pedido de playlist'],
  ] as const)('renders fixed copy in %s', (locale, title, submit, label) => {
    stubApi({})
    renderPage()

    act(() => {
      useLocaleStore.getState().setLocale(locale)
    })

    expect(screen.getByRole('heading', { level: 1, name: title })).toBeVisible()
    expect(screen.getByRole('button', { name: submit })).toBeVisible()
    expect(screen.getByRole('textbox', { name: label })).toBeVisible()
  })

  it('keeps the compact request card usable in a translated locale', async () => {
    const user = userEvent.setup()
    stubApi({ 'POST /api/ai/sessions': () => jsonResponse(createdSession(READY_SESSION), 201) })
    renderPage()

    act(() => {
      useLocaleStore.getState().setLocale('es')
    })

    await user.type(screen.getByRole('textbox'), PROMPT)
    await user.click(screen.getByRole('button', { name: 'Revisar pedido' }))

    const requestCard = (await screen.findByText('Tu pedido')).closest('section') as HTMLElement
    expect(within(requestCard).getByText(`“${PROMPT}”`)).toBeVisible()
    expect(within(requestCard).getByRole('button', { name: 'Editar pedido' })).toBeVisible()
  })
})
