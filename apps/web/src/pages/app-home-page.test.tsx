import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useLocaleStore } from '@/i18n/use-locale'
import type { Locale } from '@/i18n/messages'
import { useAuthStore } from '@/stores/auth-store'
import { testUser } from '@/test/app-harness'
import { AppHomePage } from './app-home-page'

function renderHome(options: { locale?: Locale } = {}) {
  useLocaleStore.getState().setLocale(options.locale ?? 'en')
  return render(
    <MemoryRouter>
      <AppHomePage />
    </MemoryRouter>,
  )
}

function creationLinks(name: string) {
  return within(screen.getByRole('list', { name }))
    .getAllByRole('link')
    .map((link) => link.getAttribute('href'))
}

afterEach(() => {
  useLocaleStore.getState().setLocale('en')
})

describe('App Home', () => {
  describe('Guest Mode', () => {
    beforeEach(() => {
      useAuthStore.setState({ user: null, isInitialized: true, isLoading: false })
    })

    it('leads with the three creation paths', () => {
      renderHome()

      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'What do you want to create?',
        }),
      ).toBeVisible()
      expect(creationLinks('Ways to create')).toEqual([
        '/app/mix',
        '/app/discover',
        '/app/ai',
      ])
      expect(
        screen.getByRole('link', { name: /Combine artists or genres/ }),
      ).toHaveAttribute('href', '/app/mix')
      expect(
        screen.getByRole('link', {
          name: /Describe the playlist you have in mind/,
        }),
      ).toHaveAttribute('href', '/app/ai')
    })

    it('invites connecting Spotify as a secondary action', () => {
      renderHome()

      const invitation = screen.getByRole('region', {
        name: 'Want to save playlists straight to Spotify?',
      })
      expect(
        within(invitation).getByRole('button', { name: 'Connect Spotify' }),
      ).toBeVisible()
      expect(screen.queryByRole('link', { name: /Library/ })).toBeNull()
      expect(screen.queryByRole('link', { name: /Stats/ })).toBeNull()
    })

    it('exposes every card as a single link without nested controls', () => {
      renderHome()

      for (const card of screen.getAllByRole('link')) {
        expect(card.querySelectorAll('a, button')).toHaveLength(0)
        expect(card).toHaveAccessibleName()
      }
    })
  })

  describe('Spotify Mode', () => {
    beforeEach(() => {
      useAuthStore.setState({
        user: testUser,
        isInitialized: true,
        isLoading: false,
      })
    })

    it('keeps the same creation paths', () => {
      renderHome()

      expect(creationLinks('Ways to create')).toEqual([
        '/app/mix',
        '/app/discover',
        '/app/ai',
      ])
    })

    it('adds Library and Stats as secondary actions under their own heading', () => {
      renderHome()

      const secondary = screen.getByRole('heading', {
        level: 2,
        name: 'Also in Blendify',
      })
      expect(secondary).toBeVisible()
      expect(creationLinks('Also in Blendify')).toEqual([
        '/app/library',
        '/app/stats',
      ])
      expect(
        screen.queryByRole('button', { name: 'Connect Spotify' }),
      ).toBeNull()
    })
  })

  describe('while the session is still unknown', () => {
    it('shows the creation paths without guessing the mode', () => {
      useAuthStore.setState({
        user: null,
        isInitialized: false,
        isLoading: true,
      })
      renderHome()

      expect(creationLinks('Ways to create')).toHaveLength(3)
      expect(
        screen.queryByRole('button', { name: 'Connect Spotify' }),
      ).toBeNull()
      expect(screen.queryByRole('link', { name: /Library/ })).toBeNull()
    })
  })

  describe('translations', () => {
    beforeEach(() => {
      useAuthStore.setState({ user: null, isInitialized: true, isLoading: false })
    })

    it('asks the question in Spanish', () => {
      renderHome({ locale: 'es' })

      expect(
        screen.getByRole('heading', { level: 1, name: '¿Qué quieres crear?' }),
      ).toBeVisible()
      expect(creationLinks('Formas de crear')).toHaveLength(3)
      expect(
        screen.getByRole('button', { name: 'Conectar Spotify' }),
      ).toBeVisible()
    })

    it('asks the question in Brazilian Portuguese', () => {
      renderHome({ locale: 'pt' })

      expect(
        screen.getByRole('heading', { level: 1, name: 'O que você quer criar?' }),
      ).toBeVisible()
      expect(creationLinks('Formas de criar')).toHaveLength(3)
      expect(
        screen.getByRole('button', { name: 'Conectar Spotify' }),
      ).toBeVisible()
    })
  })
})
