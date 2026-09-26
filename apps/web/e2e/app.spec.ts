import { expect, test } from './fixtures/test'
import { mockGuestSession } from './fixtures/api-mocks'

test.describe('Guest bootstrap and shell', () => {
  test.beforeEach(async ({ page }) => {
    await mockGuestSession(page)
  })

  test('loads as Guest with Guest-only navigation', async ({ page }) => {
    await page.goto('/app/mix')

    await expect(
      page.getByRole('heading', { name: 'Create your mix' }),
    ).toBeVisible()

    const mainNav = page.getByRole('navigation', { name: 'Main menu' }).first()
    await expect(mainNav.getByRole('link')).toHaveText(['Mix', 'Discover'])
    await expect(page.getByRole('link', { name: 'Library' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Stats' })).toHaveCount(0)

    await expect(
      page.getByRole('button', { name: 'Connect Spotify' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Account menu/ }),
    ).toHaveCount(0)
  })

  test('sends a direct visit to a protected route back to Mix with a Spotify notice', async ({
    page,
  }) => {
    await page.goto('/app/library')

    await expect(
      page.getByRole('heading', { name: 'Create your mix' }),
    ).toBeVisible()
    await expect(page).toHaveURL(/\/app\/mix$/)

    const notice = page
      .getByRole('status')
      .filter({ hasText: 'Connect Spotify to use your Library.' })
    await expect(notice).toBeVisible()
    await expect(
      notice.getByRole('button', { name: 'Connect Spotify' }),
    ).toBeVisible()
  })
})

test.describe('Spotify connection failure feedback', () => {
  test.beforeEach(async ({ page }) => {
    await mockGuestSession(page)
  })

  test('explains an unauthorized account and keeps Guest Mode', async ({
    page,
  }) => {
    await page.goto('/?auth_error=access_restricted')

    const notice = page.getByRole('status')
    await expect(notice).toContainText(
      "isn’t authorized for Spotify-connected features",
    )
    await expect(page.getByRole('link', { name: 'Try Blendify' })).toBeVisible()

    // The outcome is consumed once so a reload of the landing page stays clean.
    await expect(page).toHaveURL(/\/$/)
  })
})
