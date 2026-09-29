import { expect, test } from './fixtures/test'
import {
  mockAuthenticatedSession,
  mockEmptyLibrary,
  mockGenerationStream,
  mockGenres,
} from './fixtures/api-mocks'
import { generationProgress, spotifyJazzPlaylist } from './fixtures/playlists'

test.describe('Spotify generation across navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page)
    await mockGenres(page)
    await mockEmptyLibrary(page)
  })

  test('keeps a running Mix visible in the shell, finishes once, and restores the result on Mix', async ({
    page,
  }) => {
    const generation = mockGenerationStream(page, '**/api/playlists/mix', [
      generationProgress,
      { type: 'result', playlist: spotifyJazzPlaylist },
    ])
    const generationRequests: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/playlists/mix')) {
        generationRequests.push(request.url())
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

    await page
      .getByRole('navigation', { name: 'Main menu' })
      .first()
      .getByRole('link', { name: 'Library' })
      .click()
    await expect(page.getByRole('heading', { name: 'Your Library' })).toBeVisible()

    const status = page.getByRole('region', { name: 'Playlist creation' })
    await expect(status.getByText('Creating your Mix')).toBeVisible()
    await expect(status.getByRole('link', { name: 'View progress' })).toBeVisible()

    generation.release()
    await expect(status.getByText('Your Mix is ready')).toBeVisible()

    await status.getByRole('link', { name: 'View playlist' }).click()
    await expect(page).toHaveURL(/\/app\/mix$/)
    await expect(
      page.getByRole('heading', { name: 'Blendify · Mix · Jazz' }),
    ).toBeVisible()
    await expect(status).toHaveCount(0)

    await page
      .getByRole('navigation', { name: 'Main menu' })
      .first()
      .getByRole('link', { name: 'Stats' })
      .click()
    await page
      .getByRole('navigation', { name: 'Main menu' })
      .first()
      .getByRole('link', { name: 'Mix' })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Blendify · Mix · Jazz' }),
    ).toBeVisible()
    await expect(status).toHaveCount(0)
    expect(generationRequests).toHaveLength(1)
  })

  test('does not recover a finished generation after a page refresh', async ({
    page,
  }) => {
    const generation = mockGenerationStream(page, '**/api/playlists/mix', [
      generationProgress,
      { type: 'result', playlist: spotifyJazzPlaylist },
    ])

    await page.goto('/app/mix')
    await page
      .getByRole('group', { name: 'Artists or genres' })
      .getByText('Genres', { exact: true })
      .click()
    await page.getByRole('button', { name: /Jazz/ }).click()
    await page.getByRole('button', { name: 'Create playlist' }).click()
    await expect(page.getByText('Creating your playlist')).toBeVisible()
    generation.release()
    await expect(
      page.getByRole('heading', { name: 'Blendify · Mix · Jazz' }),
    ).toBeVisible()

    await page.reload()

    await expect(page.getByRole('heading', { name: 'Create your mix' })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Blendify · Mix · Jazz' }),
    ).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Playlist creation' })).toHaveCount(0)
  })
})
