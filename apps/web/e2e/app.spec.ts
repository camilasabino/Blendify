import { expect, test } from './fixtures/test'
import { mockGuestSession } from './fixtures/api-mocks'

test.describe('Guest bootstrap and shell', () => {
  test.beforeEach(async ({ page }) => {
    await mockGuestSession(page)
  })

  test('enters the app home from the landing page', async ({ page }) => {
    await page.goto('/')

    await page
      .getByRole('link', { name: 'Continue without Spotify' })
      .click()

    await expect(page).toHaveURL(/\/app$/)
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'What do you want to create?',
      }),
    ).toBeVisible()
    const actions = page.getByRole('list', { name: 'Ways to create' })
    await expect(actions.getByRole('link')).toHaveCount(3)
    await expect(page.getByRole('link', { name: 'Library' })).toHaveCount(0)
  })

  test('loads as Guest with Guest-only navigation', async ({ page }) => {
    await page.goto('/app/mix')

    await expect(
      page.getByRole('heading', { name: 'Create your mix' }),
    ).toBeVisible()

    const mainNav = page.getByRole('navigation', { name: 'Main menu' }).first()
    await expect(mainNav.getByRole('link')).toHaveText([
      'Mix',
      'Discover',
      'Create with AI',
    ])
    await expect(page.getByRole('link', { name: 'Library' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Stats' })).toHaveCount(0)

    await expect(
      page.getByRole('button', { name: 'Connect Spotify' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Account menu/ }),
    ).toHaveCount(0)
  })

  test('sends a direct visit to a protected route back to the app home with a Spotify notice', async ({
    page,
  }) => {
    await page.goto('/app/library')

    await expect(
      page.getByRole('heading', { name: 'What do you want to create?' }),
    ).toBeVisible()
    await expect(page).toHaveURL(/\/app$/)

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

  test('explains a restricted account and continues without Spotify', async ({
    page,
  }) => {
    const spotifyLogin: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/auth/spotify')) {
        spotifyLogin.push(request.url())
      }
    })
    await page.goto('/?auth_error=access_restricted')

    const notice = page.getByRole('status')
    await expect(notice).toContainText('isn’t enabled to connect with Blendify')
    await expect(notice.getByRole('button', { name: 'Connect Spotify' })).toHaveCount(
      0,
    )
    await expect(
      notice.getByRole('link', { name: 'More information' }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Continue without Spotify' }),
    ).toHaveAttribute('href', '/app')
    await expect(page).toHaveURL(/\/$/)

    await notice.getByRole('link', { name: 'More information' }).click()

    await expect(page).toHaveURL(/\/spotify-access$/)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Spotify access' }),
    ).toBeVisible()
    await expect(page).toHaveTitle('Spotify access · Blendify')
    await expect(page.getByRole('button', { name: 'Connect Spotify' })).toHaveCount(
      0,
    )
    expect(spotifyLogin).toEqual([])

    await page.getByRole('link', { name: 'Continue in Blendify' }).click()

    await expect(page).toHaveURL(/\/app$/)
    await expect(
      page.getByRole('heading', { name: 'What do you want to create?' }),
    ).toBeVisible()
  })

  test('keeps the restricted explanation usable on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/?auth_error=access_restricted')

    const notice = page.getByRole('status')
    const details = notice.getByRole('link', { name: 'More information' })
    await expect(details).toBeVisible()
    await expect(details).toBeInViewport()
    await expect(page).toHaveURL(/\/$/)
    await notice.getByRole('button', { name: 'Dismiss' }).click()
    await expect(notice).toHaveCount(0)

    await page.reload()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('status')).toHaveCount(0)

    await page.goto('/spotify-access')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Spotify access' }),
    ).toBeInViewport()
    const continueInBlendify = page.getByRole('link', {
      name: 'Continue in Blendify',
    })
    await continueInBlendify.scrollIntoViewIfNeeded()
    await expect(continueInBlendify).toBeInViewport()
  })
})
