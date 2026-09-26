import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import App from '@/App'
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
  await screen.findByRole('link', { name: /Try Blendify/i })
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
  it('explains an account that is not authorized and keeps Guest Mode', async () => {
    renderApp('/?auth_error=access_restricted')
    await landing()

    const notice = await screen.findByRole('status')
    expect(notice).toHaveTextContent(
      /isn’t authorized for Spotify-connected features/i,
    )
    expect(notice).toHaveTextContent(/Guest Mode/i)
    expect(screen.getByRole('link', { name: /Try Blendify/i })).toBeVisible()
    expect(
      screen.getAllByRole('button', { name: 'Connect Spotify' }).length,
    ).toBeGreaterThan(0)
  })

  it('uses lighter copy when the user cancelled the authorization', async () => {
    renderApp('/?auth_error=access_denied')
    await landing()

    const notice = await screen.findByRole('status')
    expect(notice).toHaveTextContent(/didn’t finish/i)
    expect(notice).not.toHaveTextContent(/authorized for Spotify-connected/i)
  })

  it('offers a retry for a provider failure', async () => {
    renderApp('/?auth_error=connection_failed')
    await landing()

    expect(await screen.findByRole('status')).toHaveTextContent(
      /couldn’t connect to Spotify/i,
    )
  })

  it('falls back to the generic message for an unknown outcome', async () => {
    renderApp('/?auth_error=something-else')
    await landing()

    expect(await screen.findByRole('status')).toHaveTextContent(
      /couldn’t connect to Spotify/i,
    )
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
      /isn’t authorized for Spotify-connected features/i,
    )
  })
})
