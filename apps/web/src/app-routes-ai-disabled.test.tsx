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
      await screen.findByRole('link', { name: 'Continue without Spotify' }),
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

  it('offers only Mix and Discover on the app home', async () => {
    await renderAppWithAiCreationDisabled('/app')

    await screen.findByRole('heading', {
      level: 1,
      name: 'What do you want to create?',
    })
    const actions = screen.getByRole('list', { name: 'Ways to create' })
    expect(
      within(actions)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/app/mix', '/app/discover'])
    expect(screen.queryByRole('link', { name: /Create with AI/ })).toBeNull()
  })

  it('refuses a stored Create with AI return target', async () => {
    sessionStorage.setItem(
      'blendify.appReturnTo',
      JSON.stringify({ target: '/app/ai', markedAt: Date.now() }),
    )
    await renderAppWithAiCreationDisabled('/app')

    expect(
      await screen.findByRole('heading', {
        name: 'What do you want to create?',
      }),
    ).toBeVisible()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app$/)
    expect(sessionStorage.getItem('blendify.appReturnTo')).toBeNull()
  })
})
