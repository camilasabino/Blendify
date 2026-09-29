import { screen, within } from '@testing-library/react'
import { useLocation } from 'react-router-dom'

function LocationProbe() {
  const location = useLocation()
  return <p data-testid="location">{location.pathname}</p>
}

async function renderAppWithAiCreationDisabled(route: string) {
  vi.stubEnv('VITE_AI_CREATION_ENABLED', 'false')
  vi.resetModules()
  const { default: App } = await import('@/App')
  const harness = await import('@/test/app-harness')
  harness.setAuthState(null)
  const { calls } = harness.stubApi({})

  harness.renderWithProviders(
    <>
      <App />
      <LocationProbe />
    </>,
    { route },
  )
  return { calls }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Create with AI disabled', () => {
  it('sends a direct visit to /app/ai to the landing page without calling the AI API', async () => {
    const { calls } = await renderAppWithAiCreationDisabled('/app/ai')

    expect(
      await screen.findByRole('link', { name: 'Try Blendify' }),
    ).toBeVisible()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
    expect(calls.filter((call) => call.url.startsWith('/api/ai/'))).toEqual([])
  })

  it('hides the Create with AI navigation entry', async () => {
    await renderAppWithAiCreationDisabled('/app/mix')

    await screen.findByRole('heading', { name: 'Create your mix' })
    const nav = screen.getAllByRole('navigation', { name: 'Main menu' })[0]
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Mix', 'Discover'])
  })

  it('stays on Mix after a Spotify reconnect that started from Create with AI', async () => {
    sessionStorage.setItem('blendify.aiReturnAfterLogin', String(Date.now()))
    await renderAppWithAiCreationDisabled('/app/mix')

    expect(
      await screen.findByRole('heading', { name: 'Create your mix' }),
    ).toBeVisible()
    expect(screen.getByTestId('location')).toHaveTextContent('/app/mix')
  })
})
