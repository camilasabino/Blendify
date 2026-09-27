import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AiSessionDto } from '@blendify/contracts'
import { useLocaleStore } from '@/i18n/use-locale'
import { jsonResponse, renderWithProviders, stubApi, type FetchCall } from '@/test/app-harness'
import { AiPlaylistPage } from './ai-playlist-page'

const PROMPT = '30 deep cuts from Radiohead and Interpol, no Coldplay'
const EXPIRES_AT = '2026-09-27T12:30:00.000Z'

const READY_SESSION: AiSessionDto = {
  sessionId: 'session-token',
  expiresAt: EXPIRES_AT,
  status: 'ready',
  intent: {
    kind: 'artist_mix',
    artists: ['Radiohead', 'Interpol'],
    genres: [],
    seedTrack: null,
    targetTrackCount: 30,
    popularity: 'rarities',
    orderMode: null,
    excludeArtists: ['Coldplay'],
    excludeTracks: [],
    unmetConstraints: [{ category: 'mood', userText: 'rainy afternoon' }],
  },
  clarification: null,
}

const CLARIFICATION_SESSION: AiSessionDto = {
  sessionId: 'session-token',
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

function expectNoGenerationAction() {
  expect(screen.queryByRole('button', { name: /create playlist/i })).toBeNull()
}

function sessionCalls(calls: FetchCall[]) {
  return calls.filter((call) => call.url.startsWith('/api/ai/sessions'))
}

afterEach(() => {
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
      respond(jsonResponse(READY_SESSION, 201))
    })

    const heading = await screen.findByRole('heading', {
      name: 'Here’s what Blendify understood',
    })
    await waitFor(() => expect(heading).toHaveFocus())
    const summary = heading.closest('section') as HTMLElement
    expect(within(summary).getByText('Radiohead · Interpol')).toBeVisible()
    expect(within(summary).getByText('Deep cuts')).toBeVisible()
    expect(within(summary).getByText('Coldplay')).toBeVisible()
    expect(within(summary).getByText('Not used')).toBeVisible()
    expect(within(summary).getByText(/rainy afternoon/)).toBeVisible()
    expect(within(summary).getByRole('button', { name: 'Edit request' })).toBeEnabled()
    expect(within(summary).getByRole('button', { name: 'Start over' })).toBeEnabled()
    expectNoGenerationAction()
  })

  it('submits with Ctrl+Enter but keeps Enter for new lines', async () => {
    const user = userEvent.setup()
    const { calls } = stubApi({
      'POST /api/ai/sessions': () => jsonResponse(READY_SESSION, 201),
    })
    renderPage()

    await user.type(promptField(), 'Radiohead{Enter}deep cuts')
    expect(sessionCalls(calls)).toEqual([])

    await user.keyboard('{Control>}{Enter}{/Control}')

    await screen.findByRole('heading', { name: 'Here’s what Blendify understood' })
    expect(sessionCalls(calls)[0].body).toEqual({ prompt: 'Radiohead\ndeep cuts' })
  })

  it('focuses a clarification and applies the chosen option', async () => {
    const user = userEvent.setup()
    const { calls } = stubApi({
      'POST /api/ai/sessions': () => jsonResponse(CLARIFICATION_SESSION, 201),
      'POST /api/ai/sessions/session-token/clarification': () =>
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
      url: '/api/ai/sessions/session-token/clarification',
      method: 'POST',
      body: { optionId: 'keep_seed:artist:1' },
    })
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

  it('edits the request from the summary and reviews it again', async () => {
    const user = userEvent.setup()
    const { calls } = stubApi({ 'POST /api/ai/sessions': () => jsonResponse(READY_SESSION, 201) })
    renderPage()

    await user.type(promptField(), PROMPT)
    await user.click(screen.getByRole('button', { name: 'Review request' }))
    await user.click(await screen.findByRole('button', { name: 'Edit request' }))

    expect(promptField()).toHaveFocus()
    expect(promptField()).toHaveValue(PROMPT)

    await user.type(promptField(), ', around 40 songs')
    await user.click(screen.getByRole('button', { name: 'Review request' }))

    await screen.findByRole('heading', { name: 'Here’s what Blendify understood' })
    expect(sessionCalls(calls).map((call) => call.body)).toEqual([
      { prompt: PROMPT },
      { prompt: `${PROMPT}, around 40 songs` },
    ])
  })

  it('starts over from the summary', async () => {
    const user = userEvent.setup()
    stubApi({ 'POST /api/ai/sessions': () => jsonResponse(READY_SESSION, 201) })
    renderPage()

    await user.type(promptField(), PROMPT)
    await user.click(screen.getByRole('button', { name: 'Review request' }))
    await user.click(await screen.findByRole('button', { name: 'Start over' }))

    expect(promptField()).toHaveValue('')
    expect(promptField()).toHaveFocus()
    expect(screen.queryByRole('heading', { name: 'Here’s what Blendify understood' })).toBeNull()
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
})
