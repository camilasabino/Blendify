import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import App from '@/App'
import { api } from '@/lib/api'
import {
  generatedAiSessionState,
  storeAiSession,
  AI_SESSION_ID,
} from '@/test/ai-session-fixtures'
import {
  jsonResponse,
  renderWithProviders,
  setAuthState,
  stubApi,
  testUser,
} from '@/test/app-harness'

const RETURN_TARGET_KEY = 'blendify.appReturnTo'
const AI_SESSION_ROUTE = `GET /api/ai/sessions/${AI_SESSION_ID}`

function LocationProbe() {
  const location = useLocation()
  return (
    <p data-testid="location">{`${location.pathname}${location.search}`}</p>
  )
}

function renderApp(route: string) {
  return renderWithProviders(
    <>
      <App />
      <LocationProbe />
    </>,
    { route },
  )
}

function location() {
  return screen.getByTestId('location')
}

function storeReturnTarget(target: string, markedAt = Date.now()) {
  sessionStorage.setItem(RETURN_TARGET_KEY, JSON.stringify({ target, markedAt }))
}

async function appHome() {
  return screen.findByRole('heading', { name: 'What do you want to create?' })
}

function stubBrowserLocation(href: string) {
  const current = { href }
  vi.spyOn(window, 'location', 'get').mockReturnValue(
    current as unknown as Location,
  )
  return current
}

afterEach(() => {
  sessionStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Landing entry', () => {
  it('sends a Spotify session straight to the app home', async () => {
    setAuthState(testUser)
    stubApi({})
    renderApp('/')

    expect(await appHome()).toBeVisible()
    await waitFor(() => expect(location()).toHaveTextContent(/^\/app$/))
  })

  it('walks a Guest to the app home from the entry call to action', async () => {
    const user = userEvent.setup()
    setAuthState(null)
    stubApi({})
    renderApp('/')

    await user.click(
      await screen.findByRole('link', { name: 'Continue without Spotify' }),
    )

    expect(await appHome()).toBeVisible()
    expect(location()).toHaveTextContent(/^\/app$/)
  })

  it('never offers the Guest entry while the session is still unknown', async () => {
    setAuthState(null, false)
    let resolveSession: (() => void) | undefined
    const pending = new Promise<void>((resolve) => {
      resolveSession = resolve
    })
    stubApi({
      'GET /api/auth/me': async () => {
        await pending
        return jsonResponse({ user: testUser })
      },
    })
    renderApp('/')

    await screen.findByRole('heading', { level: 1, name: 'Blendify' })
    expect(
      screen.queryByRole('link', { name: 'Continue without Spotify' }),
    ).toBeNull()
    expect(location()).toHaveTextContent(/^\/$/)

    resolveSession?.()

    expect(await appHome()).toBeVisible()
  })
})

describe('OAuth feedback on the landing page', () => {
  it('keeps a failure visible even when a Blendify session is still valid', async () => {
    const user = userEvent.setup()
    setAuthState(testUser)
    stubApi({})
    renderApp('/?auth_error=access_restricted')

    expect(await screen.findByRole('status')).toHaveTextContent(
      /isn’t authorized for Spotify-connected features/i,
    )
    await waitFor(() => expect(location()).toHaveTextContent(/^\/$/))
    expect(
      screen.getByRole('link', { name: 'Go to Blendify' }),
    ).toHaveAttribute('href', '/app')

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByRole('status')).toBeNull()
    expect(location()).toHaveTextContent(/^\/$/)
  })

  it('drops a pending return target after a failed attempt', async () => {
    setAuthState(null)
    stubApi({})
    storeReturnTarget('/app/mix')
    renderApp('/?auth_error=access_denied')

    await screen.findByRole('status')
    await waitFor(() =>
      expect(sessionStorage.getItem(RETURN_TARGET_KEY)).toBeNull(),
    )
  })

  it('does not inherit a pending target into a login started from the landing page', async () => {
    const user = userEvent.setup()
    setAuthState(null)
    stubApi({})
    storeReturnTarget('/app/discover')
    const browser = stubBrowserLocation('http://localhost/')
    renderApp('/')

    await user.click(
      (await screen.findAllByRole('button', { name: 'Connect Spotify' }))[0],
    )

    expect(browser.href).toBe(api.loginUrl())
    expect(sessionStorage.getItem(RETURN_TARGET_KEY)).toBeNull()
  })
})

describe('Contextual Spotify connection', () => {
  it.each(['/app/mix', '/app/discover', '/app/ai'])(
    'remembers %s when the connection starts there',
    async (route) => {
      const user = userEvent.setup()
      setAuthState(null)
      stubApi({})
      const browser = stubBrowserLocation(`http://localhost${route}`)
      renderApp(route)

      await user.click(
        (await screen.findAllByRole('button', { name: 'Connect Spotify' }))[0],
      )

      expect(browser.href).toBe(api.loginUrl())
      expect(sessionStorage.getItem(RETURN_TARGET_KEY)).toContain(route)
    },
  )

  it.each(['/app/mix', '/app/discover'])(
    'returns to %s once the callback lands on the app home',
    async (route) => {
      setAuthState(testUser)
      stubApi({})
      storeReturnTarget(route)
      renderApp('/app')

      await waitFor(() => expect(location()).toHaveTextContent(route))
      expect(sessionStorage.getItem(RETURN_TARGET_KEY)).toBeNull()
    },
  )

  it('consumes the target only once', async () => {
    setAuthState(testUser)
    stubApi({})
    storeReturnTarget('/app/discover')

    const first = renderApp('/app')
    await waitFor(() => expect(location()).toHaveTextContent('/app/discover'))
    first.unmount()

    renderApp('/app')

    expect(await appHome()).toBeVisible()
    expect(location()).toHaveTextContent(/^\/app$/)
  })

  it('ignores a target that is no longer fresh', async () => {
    setAuthState(testUser)
    stubApi({})
    storeReturnTarget('/app/mix', Date.now() - 16 * 60_000)
    renderApp('/app')

    expect(await appHome()).toBeVisible()
    expect(location()).toHaveTextContent(/^\/app$/)
  })

  it.each([
    'https://evil.example/app/mix',
    '//evil.example/app/mix',
    '/app/mix?next=/app/stats',
    '/app/library',
    '/app/stats',
  ])('refuses %s as a return target', async (target) => {
    setAuthState(testUser)
    stubApi({})
    storeReturnTarget(target)
    renderApp('/app')

    expect(await appHome()).toBeVisible()
    expect(location()).toHaveTextContent(/^\/app$/)
  })

  it('returns to Create with AI with its session intact and nothing published', async () => {
    setAuthState(testUser)
    storeAiSession()
    storeReturnTarget('/app/ai')
    const { calls } = stubApi({
      [AI_SESSION_ROUTE]: () => jsonResponse(generatedAiSessionState()),
    })
    renderApp('/app')

    await waitFor(() => expect(location()).toHaveTextContent('/app/ai'))
    expect(
      await screen.findByRole('button', { name: 'Save to Spotify' }),
    ).toBeVisible()
    expect(sessionStorage.getItem('blendify.aiSession')).not.toBeNull()
    expect(sessionStorage.getItem(RETURN_TARGET_KEY)).toBeNull()
    expect(calls.filter((call) => call.method === 'POST')).toEqual([])
  })
})

describe('App shell logo', () => {
  it.each([
    '/app',
    '/app/mix',
    '/app/discover',
    '/app/ai',
    '/app/library',
    '/app/stats',
  ])('points at the app home from %s', async (route) => {
    setAuthState(testUser)
    stubApi({})
    renderApp(route)

    const logo = await screen.findByRole('link', { name: 'Blendify home' })
    expect(logo).toHaveAttribute('href', '/app')
  })
})
