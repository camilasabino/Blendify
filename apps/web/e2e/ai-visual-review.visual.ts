import type { Page } from '@playwright/test'
import type { AiSessionStateDto } from '@blendify/contracts'
import { expect, test } from './fixtures/test'
import { mockAuthenticatedSession, mockGuestSession } from './fixtures/api-mocks'
import {
  AI_REVIEW_PROMPT,
  AI_REVIEW_SESSION_ID,
  clarificationState,
  failedState,
  generatedState,
  generatingState,
  reviewIntent,
  reviewedState,
  unsupportedIntent,
} from './fixtures/ai-sessions'

const SESSION_URL = `**/api/ai/sessions/${AI_REVIEW_SESSION_ID}`
const SCREENSHOT_DIR = 'test-results/ai-visual-review-screens'
const STATUS_CHECK_INTERVAL_MS = 3_000
const MAX_STATUS_CHECKS = 60
const COVER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b2f6b"/><stop offset="1" stop-color="#e8a838"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/></svg>'

async function blockUnmockedRequests(page: Page) {
  await page.route('**/api/**', (route) =>
    route.fulfill({
      status: 404,
      json: { statusCode: 404, code: 'NOT_FOUND', message: 'Not mocked in visual review' },
    }),
  )
  await page.route('https://artwork.blendify.test/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: COVER_SVG }),
  )
  await mockGuestSession(page)
}

async function restoreSession(page: Page, sessionState: AiSessionStateDto | null) {
  const stored = JSON.stringify({
    sessionId: AI_REVIEW_SESSION_ID,
    prompt: AI_REVIEW_PROMPT,
    playlistTitle: null,
  })
  await page.addInitScript({
    content: `sessionStorage.setItem('blendify.aiSession', ${JSON.stringify(stored)})`,
  })
  await page.route(SESSION_URL, (route) => {
    if (sessionState === null) {
      return new Promise<void>(() => undefined)
    }
    return route.fulfill({ json: sessionState })
  })
}

async function capture(page: Page, name: string) {
  await page.waitForFunction('document.fonts.status === "loaded"')
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/${test.info().project.name}/${name}.png`,
    fullPage: true,
    animations: 'disabled',
  })
}

async function openRestored(page: Page, sessionState: AiSessionStateDto | null) {
  await blockUnmockedRequests(page)
  await restoreSession(page, sessionState)
  await page.goto('/app/ai')
}

async function openReviewedLive(page: Page, sessionState: AiSessionStateDto) {
  await blockUnmockedRequests(page)
  await page.route('**/api/ai/sessions', (route) =>
    route.fulfill({ status: 201, json: { ...sessionState, execution: undefined, destination: undefined } }),
  )
  await page.goto('/app/ai')
  await page.getByRole('textbox', { name: 'Playlist request' }).fill(AI_REVIEW_PROMPT)
  await page.getByRole('button', { name: 'Review request' }).click()
}

async function openRestoredSpotify(page: Page, sessionState: AiSessionStateDto) {
  await blockUnmockedRequests(page)
  await mockAuthenticatedSession(page)
  await restoreSession(page, sessionState)
  await page.goto('/app/ai')
}

const SOUNDIIZ_URL = 'https://soundiiz.com/go/import-playlist/visualreviewtransfer'
const SPOTIFY_URL = 'https://open.spotify.com/playlist/visual-review'

function tracksDurationMs(sessionState: AiSessionStateDto): number {
  return sessionState.execution?.status === 'generated' ? sessionState.execution.durationMs : 0
}

test.describe('Create with AI visual review', () => {
  test('01 composing', async ({ page }) => {
    await blockUnmockedRequests(page)
    await page.goto('/app/ai')
    await expect(page.getByRole('button', { name: 'Review request' })).toBeVisible()
    await capture(page, '01-composing')
  })

  test('02 clarification', async ({ page }) => {
    await openReviewedLive(page, clarificationState())
    await expect(page.getByRole('heading', { name: 'One thing to confirm' })).toBeVisible()
    await capture(page, '02-clarification')
  })

  test('03 reviewed', async ({ page }) => {
    await openReviewedLive(page, reviewedState(reviewIntent))
    await expect(page.getByRole('button', { name: 'Create playlist' })).toBeVisible()
    await capture(page, '03-reviewed')
  })

  test('04 reviewed with unsupported details', async ({ page }) => {
    await openReviewedLive(page, reviewedState(unsupportedIntent))
    await expect(page.getByText('Not used')).toBeVisible()
    await capture(page, '04-reviewed-not-used')
  })

  test('05 generating', async ({ page }) => {
    await openReviewedLive(page, reviewedState(unsupportedIntent))
    await page.route(`${SESSION_URL}/generate`, () => new Promise<void>(() => undefined))
    await page.getByRole('button', { name: 'Create playlist' }).click()
    await expect(page.getByRole('heading', { name: 'Creating your playlist…' })).toBeVisible()
    await capture(page, '05-generating')
  })

  test('06 generated', async ({ page }) => {
    await openRestored(page, generatedState({ withArtwork: true, requestedMinutes: 60 }))
    await expect(page.getByRole('button', { name: 'Edit title' })).toBeVisible()
    await capture(page, '06-generated')
  })

  test('06b generated, editing title', async ({ page }) => {
    await openRestored(page, generatedState({ withArtwork: true, requestedMinutes: 60 }))
    await page.getByRole('button', { name: 'Edit title' }).click()
    await expect(page.getByRole('textbox', { name: 'Playlist title' })).toBeFocused()
    await capture(page, '06b-editing-title')
  })

  test('07 generated, duration unmet', async ({ page }) => {
    const base = generatedState({ trackCount: 18 })
    await openRestored(
      page,
      generatedState({
        trackCount: 18,
        requestedMinutes: 60,
        unmetConstraints: [
          { type: 'duration', requestedMinutes: 60, actualDurationMs: tracksDurationMs(base) },
        ],
      }),
    )
    await expect(page.getByText('Some preferences couldn’t be fully applied')).toBeVisible()
    await capture(page, '07-unmet-duration')
  })

  test('08 generated, track count unmet', async ({ page }) => {
    await openRestored(
      page,
      generatedState({
        trackCount: 27,
        requestedTrackCount: 30,
        unmetConstraints: [{ type: 'track_count', requested: 30, actual: 27 }],
      }),
    )
    await expect(page.getByText('Some preferences couldn’t be fully applied')).toBeVisible()
    await capture(page, '08-unmet-track-count')
  })

  test('09 generated, mood unmet', async ({ page }) => {
    await openRestored(
      page,
      generatedState({
        unmetConstraints: [{ type: 'mood', mood: 'happy', reason: 'seed_not_mood_based' }],
      }),
    )
    await expect(page.getByText('Some preferences couldn’t be fully applied')).toBeVisible()
    await capture(page, '09-unmet-mood')
  })

  test('10 generated, multiple unmet', async ({ page }) => {
    const base = generatedState({ trackCount: 16 })
    await openRestored(
      page,
      generatedState({
        trackCount: 16,
        requestedTrackCount: 30,
        requestedMinutes: 60,
        unmetConstraints: [
          { type: 'track_count', requested: 30, actual: 16 },
          { type: 'duration', requestedMinutes: 60, actualDurationMs: tracksDurationMs(base) },
          { type: 'mood', mood: 'happy', reason: 'seed_not_mood_based' },
        ],
      }),
    )
    await expect(page.getByText('Some preferences couldn’t be fully applied')).toBeVisible()
    await capture(page, '10-unmet-multiple')
  })

  test('11 seed not found', async ({ page }) => {
    await openRestored(
      page,
      failedState({
        code: 'AI_SEED_NOT_FOUND',
        category: 'seed_not_found',
        retryAfterSeconds: null,
        seedNotFound: { seedType: 'artist', names: ['Radiohed'] },
      }),
    )
    await expect(page.getByRole('heading', { name: 'Couldn’t create your playlist' })).toBeVisible()
    await capture(page, '11-seed-not-found')
  })

  test('12 rate limited with retry time', async ({ page }) => {
    await openRestored(
      page,
      failedState({
        code: 'SPOTIFY_QUOTA_EXCEEDED',
        category: 'provider_rate_limited',
        retryAfterSeconds: 14_400,
        seedNotFound: null,
      }),
    )
    await expect(page.getByText(/Try again in about 4 hours/)).toBeVisible()
    await capture(page, '12-rate-limited-with-time')
  })

  test('13 rate limited without retry time', async ({ page }) => {
    await openRestored(
      page,
      failedState({
        code: 'SPOTIFY_RATE_LIMITED',
        category: 'provider_rate_limited',
        retryAfterSeconds: null,
        seedNotFound: null,
      }),
    )
    await expect(page.getByText(/Try again later/)).toBeVisible()
    await capture(page, '13-rate-limited-without-time')
  })

  test('14 provider unavailable', async ({ page }) => {
    await openRestored(
      page,
      failedState({
        code: 'CATALOG_UNAVAILABLE',
        category: 'provider_unavailable',
        retryAfterSeconds: null,
        seedNotFound: null,
      }),
    )
    await expect(page.getByText(/Spotify isn’t responding/)).toBeVisible()
    await capture(page, '14-provider-unavailable')
  })

  test('15 interrupted generation', async ({ page }) => {
    await openRestored(
      page,
      failedState({
        code: 'AI_GENERATION_INTERRUPTED',
        category: 'failed',
        retryAfterSeconds: null,
        seedNotFound: null,
      }),
    )
    await expect(page.getByText(/was interrupted/)).toBeVisible()
    await capture(page, '15-interrupted')
  })

  test('16 restoring', async ({ page }) => {
    await openRestored(page, null)
    await expect(page.getByText('Loading your request…')).toBeVisible()
    await capture(page, '16-restoring')
  })

  test('17 taking longer than usual', async ({ page }) => {
    await page.clock.install()
    await openRestored(page, generatingState())
    let sessionReads = 0
    page.on('request', (request) => {
      if (request.url().endsWith(`/api/ai/sessions/${AI_REVIEW_SESSION_ID}`)) {
        sessionReads += 1
      }
    })
    await expect(page.getByRole('heading', { name: 'Creating your playlist…' })).toBeVisible()
    for (let check = 1; check <= MAX_STATUS_CHECKS; check += 1) {
      await page.clock.runFor(STATUS_CHECK_INTERVAL_MS)
      await expect.poll(() => sessionReads).toBeGreaterThanOrEqual(check)
    }
    await expect(page.getByRole('button', { name: 'Check again' })).toBeVisible()
    await capture(page, '17-taking-longer')
  })

  test('18 restored reviewed', async ({ page }) => {
    await openRestored(page, reviewedState(unsupportedIntent))
    await expect(page.getByRole('button', { name: 'Create playlist' })).toBeVisible()
    await expect(page.getByText('Not used')).toBeVisible()
    await capture(page, '18-restored-reviewed')
  })

  test('19 Guest transfer preparing', async ({ page }) => {
    await openRestored(page, generatedState({ withArtwork: true }))
    await page.route(`${SESSION_URL}/transfer`, () => new Promise<void>(() => undefined))
    await page.getByRole('button', { name: 'Prepare transfer' }).click()
    await expect(page.getByRole('button', { name: 'Preparing transfer…' })).toBeDisabled()
    await capture(page, '19-guest-transfer-preparing')
  })

  test('20 Guest transfer prepared', async ({ page }) => {
    await openRestored(
      page,
      generatedState({
        withArtwork: true,
        destination: {
          status: 'transfer_prepared',
          transfer: { url: SOUNDIIZ_URL, expiresAt: '2099-01-01T00:00:00.000Z', trackCount: 20 },
        },
      }),
    )
    await expect(page.getByRole('link', { name: /Continue on Soundiiz/ })).toBeVisible()
    await capture(page, '20-guest-transfer-prepared')
  })

  test('21 Guest transfer error', async ({ page }) => {
    await openRestored(page, generatedState({ withArtwork: true }))
    await page.route(`${SESSION_URL}/transfer`, (route) =>
      route.fulfill({
        status: 503,
        json: {
          statusCode: 503,
          code: 'TRANSFER_PROVIDER_UNAVAILABLE',
          message: 'Unavailable',
          details: { retryAfterSeconds: 30 },
        },
      }),
    )
    await page.getByRole('button', { name: 'Prepare transfer' }).click()
    await expect(page.getByText(/Soundiiz isn’t responding/)).toBeVisible()
    await capture(page, '21-guest-transfer-error')
  })

  test('22 Spotify save CTA', async ({ page }) => {
    await openRestoredSpotify(page, generatedState({ withArtwork: true, requestedMinutes: 60 }))
    await expect(page.getByRole('button', { name: 'Save to Spotify' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Prepare transfer' })).toHaveCount(0)
    await capture(page, '22-spotify-save')
  })

  test('23 Spotify saving', async ({ page }) => {
    await openRestoredSpotify(page, generatedState({ withArtwork: true }))
    await page.route(`${SESSION_URL}/publish`, () => new Promise<void>(() => undefined))
    await page.getByRole('button', { name: 'Save to Spotify' }).click()
    await expect(page.getByRole('button', { name: 'Saving to Spotify…' })).toBeDisabled()
    await capture(page, '23-spotify-saving')
  })

  test('24 Spotify saved', async ({ page }) => {
    await openRestoredSpotify(page, generatedState({ withArtwork: true }))
    await page.route(`${SESSION_URL}/publish`, (route) =>
      route.fulfill({
        json: generatedState({
          withArtwork: true,
          destination: { status: 'published', spotifyUrl: SPOTIFY_URL, savedToLibrary: true },
        }),
      }),
    )
    await page.getByRole('button', { name: 'Save to Spotify' }).click()
    await expect(page.getByRole('heading', { name: 'Saved to Spotify' })).toBeFocused()
    await capture(page, '24-spotify-saved')
  })

  test('25 Spotify reauthorization required', async ({ page }) => {
    await openRestoredSpotify(page, generatedState({ withArtwork: true }))
    await page.route(`${SESSION_URL}/publish`, (route) =>
      route.fulfill({
        status: 401,
        json: {
          statusCode: 401,
          code: 'SPOTIFY_REAUTH_REQUIRED',
          message: 'Spotify authorization is no longer valid. Reconnect Spotify.',
        },
      }),
    )
    await page.getByRole('button', { name: 'Save to Spotify' }).click()
    await expect(page.getByRole('button', { name: 'Connect Spotify' }).last()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save to Spotify' })).toHaveCount(0)
    await capture(page, '25-spotify-reconnect')
  })

  test('26 Spotify rate limited', async ({ page }) => {
    await openRestoredSpotify(page, generatedState({ withArtwork: true }))
    await page.route(`${SESSION_URL}/publish`, (route) =>
      route.fulfill({
        status: 429,
        json: {
          statusCode: 429,
          code: 'SPOTIFY_RATE_LIMITED',
          message: 'Limited',
          details: { retryAfterSeconds: 45 },
        },
      }),
    )
    await page.getByRole('button', { name: 'Save to Spotify' }).click()
    await expect(page.getByText(/Too many requests/)).toBeVisible()
    await capture(page, '26-spotify-rate-limited')
  })

  test('27 Spotify publish incomplete', async ({ page }) => {
    await openRestoredSpotify(
      page,
      generatedState({
        withArtwork: true,
        destination: { status: 'publish_incomplete', spotifyUrl: SPOTIFY_URL },
      }),
    )
    await expect(page.getByRole('heading', { name: 'Couldn’t finish saving to Spotify' })).toBeVisible()
    await capture(page, '27-spotify-incomplete')
  })
})
