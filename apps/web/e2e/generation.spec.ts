import type { Page } from '@playwright/test'
import { expect, test } from './fixtures/test'
import {
  mockGenerationStream,
  mockGenres,
  mockGuestSession,
} from './fixtures/api-mocks'
import {
  generationProgress,
  guestJazzPlaylist,
  guestJazzPlaylistWithTransfer,
} from './fixtures/playlists'

async function generateJazzMix(
  page: Page,
  generation: { release: () => void },
) {
  await page.goto('/app/mix')
  // The radio input itself is visually hidden (sr-only); its wrapping label
  // is what the browser treats as the clickable, hit-testable surface.
  await page
    .getByRole('group', { name: 'Artists or genres' })
    .getByText('Genres', { exact: true })
    .click()
  await page.getByRole('button', { name: /Jazz/ }).click()
  await page.getByRole('button', { name: 'Generate playlist' }).click()

  // The submit handler flips to the working state synchronously, before the
  // mocked network call resolves, so this is observable deterministically as
  // long as the mocked response is gated until we assert it.
  await expect(page.getByText('Generating your playlist')).toBeVisible()
  generation.release()
}

test.describe('Guest generation journey', () => {
  test.beforeEach(async ({ page }) => {
    await mockGuestSession(page)
    await mockGenres(page)
  })

  test('selects genres, submits, and renders the generated playlist', async ({
    page,
  }) => {
    const generation = mockGenerationStream(page, '**/api/generate/mix', [
      generationProgress,
      { type: 'result', playlist: guestJazzPlaylist },
    ])

    await generateJazzMix(page, generation)

    await expect(
      page.getByRole('heading', { name: 'Blendify · Mix · Jazz' }),
    ).toBeVisible()
    const songs = page.getByRole('list', { name: 'Songs in this playlist' })
    await expect(songs.getByText('So What')).toBeVisible()
    await expect(
      songs.getByText('Miles Davis, John Coltrane · Kind of Blue'),
    ).toBeVisible()

    // No transfer metadata on this playlist: the Soundiiz action must not show.
    await expect(
      page.getByRole('region', { name: 'Transfer with Soundiiz' }),
    ).toHaveCount(0)
  })
})

test.describe('Guest Soundiiz transfer', () => {
  test.beforeEach(async ({ page }) => {
    await mockGuestSession(page)
    await mockGenres(page)
    const generation = mockGenerationStream(page, '**/api/generate/mix', [
      generationProgress,
      { type: 'result', playlist: guestJazzPlaylistWithTransfer },
    ])
    await generateJazzMix(page, generation)
  })

  test('prepares a transfer and offers an explicit Soundiiz CTA without redirecting', async ({
    page,
  }) => {
    const mockedTransferUrl = 'https://app.soundiiz.com/e2e-mock-transfer'
    await page.route('**/api/transfers', (route) =>
      route.fulfill({
        json: {
          url: mockedTransferUrl,
          expiresAt: '2099-01-01T00:00:00.000Z',
          trackCount: 1,
        },
      }),
    )

    const popups: unknown[] = []
    page.on('popup', (popup) => popups.push(popup))

    const transferSection = page.getByRole('region', {
      name: 'Transfer with Soundiiz',
    })
    await expect(transferSection).toBeVisible()

    const startUrl = page.url()
    await transferSection.getByRole('button', { name: 'Prepare transfer' }).click()

    const continueLink = transferSection.getByRole('link', {
      name: /Continue on Soundiiz/,
    })
    await expect(continueLink).toBeVisible()
    await expect(continueLink).toHaveAttribute('href', mockedTransferUrl)
    await expect(continueLink).toHaveAttribute('target', '_blank')

    // Preparing the transfer must stay inside the app: no auto-redirect, no
    // automatically opened Soundiiz window.
    expect(page.url()).toBe(startUrl)
    expect(popups).toHaveLength(0)
  })
})
