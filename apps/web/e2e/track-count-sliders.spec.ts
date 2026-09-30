import { expect, test } from './fixtures/test'
import { mockGuestSession } from './fixtures/api-mocks'
import { guestJazzPlaylist } from './fixtures/playlists'

const discoverPlaylist = {
  ...guestJazzPlaylist,
  name: 'Blendify · Discover · Sade',
  generation: {
    version: 1,
    kind: 'discover_artist',
    targetTrackCount: 23,
    seed: { id: 'sade', name: 'Sade' },
    popularity: 'balanced',
    orderMode: 'random',
  },
  seeds: [{ type: 'artist', id: 'sade', name: 'Sade' }],
}

test.describe('Track count sliders', () => {
  test.beforeEach(async ({ page }) => {
    await mockGuestSession(page)
    await page.route('**/api/artists/similar**', (route) =>
      route.fulfill({ json: { artists: [], hasMore: false } }),
    )
    await page.route('**/api/genres/explore**', (route) =>
      route.fulfill({ json: { genres: [], hasMore: false } }),
    )
  })

  test('selects an intermediate discover count from the keyboard and submits it', async ({
    page,
  }) => {
    const bodies: unknown[] = []
    await page.route('**/api/artists/search**', (route) =>
      route.fulfill({
        json: {
          artists: [
            {
              id: 'sade',
              name: 'Sade',
              imageUrl: null,
              externalUrl: 'https://open.spotify.com/artist/sade',
            },
          ],
        },
      }),
    )
    await page.route('**/api/generate/discover', async (route) => {
      bodies.push(route.request().postDataJSON())
      await route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body: `${JSON.stringify({ type: 'result', playlist: discoverPlaylist })}\n`,
      })
    })

    await page.goto('/app/discover')
    const slider = page.getByRole('slider', { name: 'Playlist size' })
    await expect(slider).toHaveValue('10')
    await expect(page.getByText('10 songs')).toBeVisible()
    await slider.focus()
    await page.keyboard.press('Home')
    await expect(slider).toHaveValue('1')
    await expect(page.getByText('1 song')).toBeVisible()
    await page.keyboard.press('End')
    await expect(slider).toHaveValue('50')
    await page.keyboard.press('Home')
    for (let step = 0; step < 22; step += 1) {
      await page.keyboard.press('ArrowRight')
    }
    await expect(slider).toHaveValue('23')
    await expect(page.getByText('23 songs')).toBeVisible()

    await page.getByRole('combobox').fill('sade')
    await page.getByRole('option', { name: 'Sade' }).click()
    await page.getByRole('button', { name: 'Generate playlist' }).click()

    await expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatchObject({
      kind: 'discover_artist',
      targetTrackCount: 23,
    })
  })

  test('lowers the mix maximum and the selected count when another artist is added', async ({
    page,
  }) => {
    await page.route('**/api/artists/search**', (route) => {
      const query = new URL(route.request().url()).searchParams.get('q') ?? 'Artist'
      const id = query.toLowerCase().replaceAll(/\s+/g, '-')
      return route.fulfill({
        json: {
          artists: [
            {
              id,
              name: query,
              imageUrl: null,
              externalUrl: `https://open.spotify.com/artist/${id}`,
            },
          ],
        },
      })
    })

    await page.goto('/app/mix')
    const slider = page.getByRole('slider', { name: 'Songs per artist' })
    await slider.focus()
    await page.keyboard.press('End')
    for (let step = 0; step < 10; step += 1) {
      await page.keyboard.press('ArrowLeft')
    }
    await expect(slider).toHaveValue('40')
    await expect(page.getByText('Up to 50 songs per artist')).toBeVisible()

    const search = page.getByRole('combobox', { name: 'Artists' })
    await search.fill('Sade')
    await page.getByRole('option', { name: 'Sade' }).click()
    await expect(slider).toHaveValue('40')
    await expect(slider).toHaveAttribute('max', '50')

    await search.fill('Portishead')
    await page.getByRole('option', { name: 'Portishead' }).click()
    await expect(slider).toHaveValue('25')
    await expect(slider).toHaveAttribute('max', '25')
    await expect(page.getByText('Up to 25 songs per artist')).toBeVisible()

    await page.getByRole('button', { name: 'Remove Portishead' }).click()
    await expect(slider).toHaveValue('25')
    await expect(slider).toHaveAttribute('max', '50')
  })

  test('moves the mix slider with mouse and touch and blocks it while generating', async ({
    page,
  }) => {
    let releaseGeneration: () => void = () => {}
    const generationGate = new Promise<void>((resolve) => {
      releaseGeneration = resolve
    })
    await page.route('**/api/genres', (route) =>
      route.fulfill({ json: { genres: [{ id: 'jazz', name: 'Jazz' }] } }),
    )
    await page.route('**/api/generate/mix', async (route) => {
      await generationGate
      await route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body: `${JSON.stringify({ type: 'result', playlist: guestJazzPlaylist })}\n`,
      })
    })

    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/app/mix')
    await expect(page.locator('body')).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    )
    expect(overflow).toBe(false)

    await page
      .getByRole('group', { name: 'Artists or genres' })
      .getByText('Genres', { exact: true })
      .click()
    const slider = page.getByRole('slider', { name: 'Songs per genre' })
    await slider.scrollIntoViewIfNeeded()
    const box = await slider.boundingBox()
    if (!box) {
      throw new Error('Mix slider has no box')
    }
    await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2)
    await expect(slider).toHaveValue('50')

    await page.getByRole('button', { name: 'Jazz' }).click()
    await page.getByRole('button', { name: 'Generate playlist' }).click()
    await page.getByRole('button', { name: /Show settings/ }).click()
    await expect(slider).toBeDisabled()
    releaseGeneration()
    await expect(page.getByRole('heading', { name: 'Blendify · Mix · Jazz' })).toBeVisible()
  })

  test('keeps the size section usable at 200% zoom', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/app/mix')
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2'
    })
    const slider = page.getByRole('slider', { name: 'Songs per artist' })
    await expect(slider).toBeVisible()
    await expect(page.getByText('10 songs')).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    )
    expect(overflow).toBe(false)
  })
})

test.describe('Track count slider touch', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })

  test('changes the discover count from a touch', async ({ page }) => {
    await mockGuestSession(page)
    await page.goto('/app/discover')
    const slider = page.getByRole('slider', { name: 'Playlist size' })
    await slider.scrollIntoViewIfNeeded()
    const box = await slider.boundingBox()
    if (!box) {
      throw new Error('Discover slider has no box')
    }
    await page.touchscreen.tap(box.x + box.width - 2, box.y + box.height / 2)
    await expect(slider).toHaveValue('50')
    await expect(page.getByText('50 songs')).toBeVisible()
  })
})
