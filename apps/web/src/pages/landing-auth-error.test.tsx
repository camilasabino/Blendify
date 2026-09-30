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
} from '@/test/app-harness'

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

/** Waits for the landing page itself, past the lazy-route loading state. */
async function landing(): Promise<void> {
  await screen.findByRole('link', { name: /Continue without Spotify/i })
}

beforeEach(() => {
  setAuthState(null)
  stubApi({ 'GET /api/auth/me': () => jsonResponse({ user: null }) })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Spotify connection failures on the landing page', () => {
  it('explains a restricted account without inviting the same attempt again', async () => {
    renderApp('/?auth_error=access_restricted')
    await landing()

    const notice = await screen.findByRole('status')
    expect(notice).toHaveTextContent(/isn’t enabled to connect with Blendify/i)
    expect(notice).toHaveTextContent(/without connecting Spotify/i)
    expect(within(notice).queryByRole('button', { name: 'Connect Spotify' })).toBeNull()
    expect(
      within(notice).getByRole('link', { name: 'More information' }),
    ).toHaveAttribute('href', '/spotify-access')
    expect(
      screen.getByRole('link', { name: 'Continue without Spotify' }),
    ).toHaveAttribute('href', '/app')
  })

  it.each([
    ['access_denied', /didn’t finish connecting your Spotify account/i],
    ['connection_failed', /couldn’t connect to Spotify/i],
    ['invalid_state', /no longer valid/i],
  ] as const)('offers a new connection attempt for %s', async (error, message) => {
    renderApp(`/?auth_error=${error}`)
    await landing()

    const notice = await screen.findByRole('status')
    expect(notice).toHaveTextContent(message)
    expect(
      within(notice).getByRole('button', { name: 'Connect Spotify' }),
    ).toBeVisible()
    expect(within(notice).queryByRole('link', { name: 'More information' })).toBeNull()
  })

  it('opens the explanation without starting Spotify login', async () => {
    const user = userEvent.setup()
    const loginUrl = vi.spyOn(api, 'loginUrl')
    renderApp('/?auth_error=access_restricted')
    await landing()

    await user.click(
      within(await screen.findByRole('status')).getByRole('link', {
        name: 'More information',
      }),
    )

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Spotify access' }),
    ).toBeVisible()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/spotify-access$/)
    expect(loginUrl).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Connect Spotify' })).toBeNull()
  })

  it('falls back to the generic message for an unknown outcome', async () => {
    renderApp('/?auth_error=something-else')
    await landing()

    const notice = await screen.findByRole('status')
    expect(notice).toHaveTextContent(/couldn’t connect to Spotify/i)
    expect(
      within(notice).getByRole('button', { name: 'Connect Spotify' }),
    ).toBeVisible()
  })

  it('moves from the explanation to dismiss with the keyboard', async () => {
    const user = userEvent.setup()
    renderApp('/?auth_error=access_restricted')
    await landing()

    const notice = await screen.findByRole('status')
    const details = within(notice).getByRole('link', { name: 'More information' })
    details.focus()
    await user.tab()

    expect(within(notice).getByRole('button', { name: 'Dismiss' })).toHaveFocus()
  })

  it('removes the outcome from the URL so a reload is clean', async () => {
    renderApp('/?auth_error=access_restricted')
    await landing()

    expect(await screen.findByRole('status')).toBeVisible()
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/),
    )
  })

  it('shows nothing on a plain landing visit', async () => {
    renderApp('/')
    await landing()

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('can be dismissed', async () => {
    renderApp('/?auth_error=access_restricted')
    await landing()
    await screen.findByRole('status')

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('surfaces feedback again after a repeated failed attempt', async () => {
    const first = renderApp('/?auth_error=access_restricted')
    await landing()
    expect(await screen.findByRole('status')).toBeVisible()
    first.unmount()

    renderApp('/?auth_error=access_restricted')
    await landing()
    expect(await screen.findByRole('status')).toHaveTextContent(
      /isn’t enabled to connect with Blendify/i,
    )
  })
})
