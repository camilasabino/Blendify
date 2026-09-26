import { expect, test } from './fixtures/test'
import {
  mockAuthenticatedSession,
  mockGenres,
  mockLogout,
  mockPendingGeneration,
} from './fixtures/api-mocks'

test.describe('Authenticated shell', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page)
  })

  test('shows Spotify-connected navigation and account menu', async ({
    page,
  }) => {
    await page.goto('/app/mix')

    await expect(
      page.getByRole('heading', { name: 'Create your mix' }),
    ).toBeVisible()

    const mainNav = page.getByRole('navigation', { name: 'Main menu' }).first()
    await expect(mainNav.getByRole('link')).toHaveText([
      'Mix',
      'Discover',
      'Library',
      'Stats',
    ])
    await expect(
      page.getByRole('button', { name: 'Account menu: Camila' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Connect Spotify' }),
    ).toHaveCount(0)
  })
})

test.describe('Logout', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page)
    await mockLogout(page)
  })

  test('returns to the Guest landing page and drops authenticated navigation', async ({
    page,
  }) => {
    await page.goto('/app/mix')
    await page.getByRole('button', { name: 'Account menu: Camila' }).click()
    await page.getByRole('menuitem', { name: 'Log out' }).click()

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('link', { name: 'Try Blendify' })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Account menu: Camila' }),
    ).toHaveCount(0)
  })

  test('aborts an in-flight generation request and still lands on Guest', async ({
    page,
  }) => {
    await mockGenres(page)
    const generation = mockPendingGeneration(page, '**/api/playlists/mix')

    const abortedRequests: string[] = []
    page.on('requestfailed', (request) => {
      if (request.url().includes('/api/playlists/mix')) {
        abortedRequests.push(request.url())
      }
    })

    await page.goto('/app/mix')
    await page
      .getByRole('group', { name: 'Artists or genres' })
      .getByText('Genres', { exact: true })
      .click()
    await page.getByRole('button', { name: /Jazz/ }).click()
    await page.getByRole('button', { name: 'Create playlist' }).click()
    await expect(page.getByText('Creating your playlist')).toBeVisible()

    await page.getByRole('button', { name: 'Account menu: Camila' }).click()
    await page.getByRole('menuitem', { name: 'Log out' }).click()

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('link', { name: 'Try Blendify' })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Account menu: Camila' }),
    ).toHaveCount(0)

    // Logout must genuinely cancel the request at the network level, not just
    // hide it behind the Guest UI.
    await expect
      .poll(() => abortedRequests.length, {
        message: 'Expected the in-flight /api/playlists/mix request to abort',
      })
      .toBeGreaterThan(0)

    generation.release()
  })
})
