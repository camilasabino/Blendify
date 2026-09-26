import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import App from '@/App'
import { api } from '@/lib/api'
import {
  jsonResponse,
  renderWithProviders,
  setAuthState,
  stubApi,
  testUser,
} from '@/test/app-harness'

function LocationProbe() {
  const location = useLocation()
  return <p data-testid="location">{location.pathname}</p>
}

function renderApp(route: string, options: { strict?: boolean } = {}) {
  return renderWithProviders(
    <>
      <App />
      <LocationProbe />
    </>,
    { route, ...options },
  )
}

function mainNav() {
  return screen.getAllByRole('navigation', { name: 'Main menu' })[0]
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('auth bootstrap', () => {
  it('probes the session once even with several capability consumers', async () => {
    setAuthState(null, false)
    const { calls } = stubApi({
      'GET /api/auth/me': () => jsonResponse({ user: null }),
    })

    renderApp('/app/mix', { strict: true })

    expect(
      await screen.findByRole('heading', { name: 'Create your mix' }),
    ).toBeVisible()
    await screen.findByRole('button', { name: 'Connect Spotify' })
    expect(calls.filter((call) => call.url === '/api/auth/me')).toHaveLength(1)
  })
})

describe('Landing', () => {
  it('lets visitors try Blendify first and connect Spotify optionally', async () => {
    setAuthState(null)
    stubApi({})
    renderApp('/')

    expect(
      await screen.findByRole('link', { name: 'Try Blendify' }),
    ).toHaveAttribute('href', '/app/mix')
    expect(
      screen.getAllByRole('button', { name: 'Connect Spotify' }).length,
    ).toBeGreaterThan(0)
  })
})

describe('Privacy Policy', () => {
  beforeEach(() => {
    setAuthState(null)
    stubApi({})
  })

  it('is public and linked from the footer', async () => {
    const user = userEvent.setup()
    renderApp('/')

    await user.click(await screen.findByRole('link', { name: 'Privacy' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Privacy Policy' }),
    ).toBeVisible()
    expect(screen.getByTestId('location')).toHaveTextContent('/privacy')
    expect(
      screen.getByRole('link', { name: 'Manage apps connected to Spotify' }),
    ).toHaveAttribute('href', 'https://www.spotify.com/account/apps/')
    expect(screen.getByText(/blendify_session/)).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Email contacto@camilasabino.dev' }),
    ).toHaveAttribute('href', 'mailto:contacto@camilasabino.dev')
  })
})

describe('Guest routing', () => {
  beforeEach(() => {
    setAuthState(null)
    stubApi({})
  })

  it('opens Mix without Spotify', async () => {
    renderApp('/app/mix')

    expect(
      await screen.findByRole('heading', { name: 'Create your mix' }),
    ).toBeVisible()
  })

  it('opens Discover without Spotify with Guest generation copy', async () => {
    renderApp('/app/discover')

    expect(
      await screen.findByRole('heading', {
        name: 'Start with one artist or song',
      }),
    ).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Size' })).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Generate playlist' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Add a cover image')).toBeNull()
  })

  it('redirects /app to Mix', async () => {
    renderApp('/app')

    expect(
      await screen.findByRole('heading', { name: 'Create your mix' }),
    ).toBeVisible()
  })

  it.each([
    ['/app/library', 'Connect Spotify to use your Library.'],
    ['/app/stats', 'Connect Spotify to see your stats.'],
  ])('sends %s to Mix with a Spotify notice', async (route, notice) => {
    const user = userEvent.setup()
    renderApp(route)

    expect(
      await screen.findByRole('heading', { name: 'Create your mix' }),
    ).toBeVisible()
    expect(screen.getByTestId('location')).toHaveTextContent('/app/mix')
    const status = screen.getByText(notice).closest('[role="status"]')
    expect(status).not.toBeNull()
    expect(
      within(status as HTMLElement).getByRole('button', {
        name: 'Connect Spotify',
      }),
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(notice)).toBeNull()
  })

  it('shows Mix, Discover, and Connect Spotify only', async () => {
    renderApp('/app/mix')
    await screen.findByRole('heading', { name: 'Create your mix' })

    const links = within(mainNav()).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['Mix', 'Discover'])
    expect(screen.queryByRole('link', { name: 'Library' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Stats' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Account menu/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Preferences' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Connect Spotify' })).toBeVisible()
  })

  it('starts the existing OAuth flow from Connect Spotify', async () => {
    const user = userEvent.setup()
    const location = { href: 'http://localhost/app/mix' }
    vi.spyOn(window, 'location', 'get').mockReturnValue(
      location as unknown as Location,
    )
    renderApp('/app/mix')

    await user.click(
      await screen.findByRole('button', { name: 'Connect Spotify' }),
    )

    expect(location.href).toBe(api.loginUrl())
  })
})

describe('account deletion', () => {
  async function openConfirmation(
    routes: Parameters<typeof stubApi>[0] = {},
    route = '/app/library',
  ) {
    const user = userEvent.setup()
    const { calls } = stubApi(routes)
    renderApp(route)

    await user.click(
      await screen.findByRole('button', { name: 'Account menu: Camila' }),
    )
    await user.click(screen.getByRole('menuitem', { name: 'Delete account' }))
    await screen.findByRole('heading', {
      name: 'Delete your Blendify account?',
    })
    return { user, calls }
  }

  it('offers the action only while authenticated', async () => {
    setAuthState(null)
    stubApi({})
    renderApp('/app/mix')

    await screen.findByRole('button', { name: 'Connect Spotify' })
    expect(
      screen.queryByRole('button', { name: /Account menu/ }),
    ).not.toBeInTheDocument()
  })

  it('explains the consequences and leaves everything untouched on Cancel', async () => {
    setAuthState(testUser)
    const { user, calls } = await openConfirmation()

    expect(
      screen.getByText(/Your Spotify account is not affected/),
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(
      screen.queryByRole('heading', { name: 'Delete your Blendify account?' }),
    ).not.toBeInTheDocument()
    expect(calls.filter((call) => call.url === '/api/account')).toHaveLength(0)
    expect(
      screen.getByRole('button', { name: 'Account menu: Camila' }),
    ).toBeVisible()
  })

  it('deletes the account once and returns the app to Guest mode', async () => {
    setAuthState(testUser)
    let resolveDelete: (() => void) | undefined
    const pending = new Promise<void>((resolve) => {
      resolveDelete = resolve
    })
    const { user, calls } = await openConfirmation({
      'DELETE /api/account': async () => {
        await pending
        return jsonResponse({ ok: true })
      },
    })

    const confirm = screen.getByRole('button', { name: 'Delete my account' })
    await user.click(confirm)
    expect(confirm).toBeDisabled()
    await user.click(confirm)
    resolveDelete?.()

    expect(
      await screen.findByRole('button', { name: 'Connect Spotify' }),
    ).toBeVisible()
    const deleteCalls = calls.filter((call) => call.url === '/api/account')
    expect(deleteCalls).toHaveLength(1)
    expect(deleteCalls[0].method).toBe('DELETE')
    expect(deleteCalls[0].body).toBeUndefined()
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/app/mix'),
    )
    expect(screen.queryByText('Connect Spotify to use your Library.')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Library' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Stats' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Account menu: Camila' }),
    ).toBeNull()
  })

  it('keeps the user signed in and reports the failure', async () => {
    setAuthState(testUser)
    let failDelete: (() => void) | undefined
    const pending = new Promise<void>((resolve) => {
      failDelete = resolve
    })
    const { user } = await openConfirmation({
      // Rejecting after the click settles is what a slow API looks like: the
      // route must not drift away from the Spotify-only page it started on.
      'DELETE /api/account': async () => {
        await pending
        return jsonResponse(
          { statusCode: 500, code: 'INTERNAL_ERROR', message: 'nope' },
          500,
        )
      },
    })

    await user.click(screen.getByRole('button', { name: 'Delete my account' }))
    failDelete?.()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We couldn’t delete your account.',
    )
    expect(
      screen.getByRole('button', { name: 'Account menu: Camila' }),
    ).toBeVisible()
    expect(screen.getByTestId('location')).toHaveTextContent('/app/library')
  })
})

describe('Spotify Mode routing', () => {
  beforeEach(() => {
    setAuthState(testUser)
  })

  it('shows the full authenticated navigation', async () => {
    stubApi({})
    renderApp('/app/mix')
    await screen.findByRole('heading', { name: 'Create your mix' })

    const links = within(mainNav()).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual([
      'Mix',
      'Discover',
      'Library',
      'Stats',
    ])
    expect(
      screen.getByRole('button', { name: 'Account menu: Camila' }),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Connect Spotify' })).toBeNull()
  })

  it('keeps the Spotify Discover copy', async () => {
    stubApi({})
    renderApp('/app/discover')

    expect(
      await screen.findByRole('heading', { name: 'Size and cover' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Create playlist' }),
    ).toBeInTheDocument()
  })

  it.each([
    ['/app/library', 'Your Library'],
    ['/app/stats', 'Your stats'],
  ])('opens %s', async (route, heading) => {
    stubApi({})
    renderApp(route)

    expect(await screen.findByRole('heading', { name: heading })).toBeVisible()
    expect(screen.getByTestId('location')).toHaveTextContent(route)
  })

  it.each(['/app/library', '/app/mix'])(
    'logs out from %s into a usable Guest Mix',
    async (route) => {
      const user = userEvent.setup()
      const { calls } = stubApi({
        'POST /api/auth/logout': () => jsonResponse({ ok: true }),
      })
      renderApp(route)

      await user.click(
        await screen.findByRole('button', { name: 'Account menu: Camila' }),
      )
      await user.click(screen.getByRole('menuitem', { name: 'Log out' }))

      expect(
        await screen.findByRole('button', { name: 'Connect Spotify' }),
      ).toBeVisible()
      expect(screen.getByTestId('location')).toHaveTextContent('/app/mix')
      expect(
        screen.getByRole('heading', { name: 'Create your mix' }),
      ).toBeVisible()
      expect(screen.queryByText('Connect Spotify to use your Library.')).toBeNull()
      expect(screen.queryByRole('link', { name: 'Library' })).toBeNull()
      expect(
        screen.getByRole('button', { name: 'Generate playlist' }),
      ).toBeInTheDocument()
      await waitFor(() =>
        expect(
          calls.filter((call) => call.url === '/api/auth/logout'),
        ).toHaveLength(1),
      )
    },
  )
})
