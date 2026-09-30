import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import App from '@/App'
import { api } from '@/lib/api'
import { useLocaleStore } from '@/i18n/use-locale'
import type { Locale } from '@/i18n/messages'
import {
  renderWithProviders,
  setAuthState,
  stubApi,
  testUser,
} from '@/test/app-harness'

function LocationProbe() {
  const location = useLocation()
  return <p data-testid="location">{location.pathname}</p>
}

function renderPage(locale: Locale = 'en') {
  const view = renderWithProviders(
    <>
      <App />
      <LocationProbe />
    </>,
    { route: '/spotify-access' },
  )
  if (locale !== 'en') {
    useLocaleStore.getState().setLocale(locale)
  }
  return view
}

beforeEach(() => {
  setAuthState(null)
  stubApi({})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Spotify access page', () => {
  it('explains the restriction to a Guest without starting login', async () => {
    const loginUrl = vi.spyOn(api, 'loginUrl')
    renderPage()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Spotify access' }),
    ).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Why this happens' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'What you can do' })).toBeVisible()
    expect(screen.getByText(/development mode/i)).toBeVisible()
    expect(screen.getByText(/same account does not remove/i)).toBeVisible()
    expect(screen.getByText(/Song details still come from Spotify/)).toBeVisible()
    expect(screen.getByText(/Soundiiz/)).toBeVisible()
    expect(screen.getByText(/Library/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Connect Spotify' })).toBeNull()
    expect(loginUrl).not.toHaveBeenCalled()
    expect(screen.getByTestId('location')).toHaveTextContent('/spotify-access')
    await waitFor(() =>
      expect(document.title).toBe('Spotify access · Blendify'),
    )
  })

  it('continues into the app home', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('link', { name: 'Continue in Blendify' }),
    )

    expect(
      await screen.findByRole('heading', { name: 'What do you want to create?' }),
    ).toBeVisible()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app$/)
  })

  it('stays available when a Blendify session already exists', async () => {
    setAuthState(testUser)
    renderPage()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Spotify access' }),
    ).toBeVisible()
    expect(screen.getByTestId('location')).toHaveTextContent('/spotify-access')
    expect(screen.queryByRole('button', { name: 'Connect Spotify' })).toBeNull()
  })

  it('uses neutral Spanish', async () => {
    renderPage('es')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Acceso a Spotify' }),
    ).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Por qué sucede' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Qué puedes hacer' })).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Continuar en Blendify' }),
    ).toHaveAttribute('href', '/app')
    expect(document.body).not.toHaveTextContent(/podés|probá|tenés|empezalo/i)
    await waitFor(() =>
      expect(document.title).toBe('Acceso a Spotify · Blendify'),
    )
  })

  it('uses Brazilian Portuguese', async () => {
    renderPage('pt')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Acesso ao Spotify' }),
    ).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Por que isso acontece' }),
    ).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'O que você pode fazer' }),
    ).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Continuar no Blendify' }),
    ).toHaveAttribute('href', '/app')
    await waitFor(() =>
      expect(document.title).toBe('Acesso ao Spotify · Blendify'),
    )
  })
})
