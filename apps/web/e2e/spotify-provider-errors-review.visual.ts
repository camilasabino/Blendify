import type { Page } from '@playwright/test'
import { expect, test } from './fixtures/test'
import {
  mockAuthenticatedSession,
  mockEmptyLibrary,
  mockGenres,
} from './fixtures/api-mocks'
import { spotifyJazzPlaylist } from './fixtures/playlists'

const SCREENSHOT_DIR = 'test-results/spotify-provider-errors-review'
const LOCALES = ['en', 'es', 'pt'] as const
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'phone', width: 390, height: 844 },
] as const

type StreamEvent = Record<string, unknown>

const STATES: Record<string, StreamEvent> = {
  retryable: {
    type: 'error',
    statusCode: 503,
    code: 'SPOTIFY_UNAVAILABLE',
    message: 'raw',
    details: { operation: 'searchTracks', category: 'upstream_error', status: 502 },
  },
  'retryable-spotify-wait': {
    type: 'error',
    statusCode: 503,
    code: 'SPOTIFY_UNAVAILABLE',
    message: 'raw',
    details: {
      operation: 'searchTracks',
      category: 'upstream_error',
      status: 503,
      retryAfterSeconds: 30,
      retryAfterSource: 'spotify',
    },
  },
  'connection-lost': {
    type: 'progress',
    phase: 'publishing',
    current: 1,
    total: 1,
    percent: 95,
  },
  unconfirmed: {
    type: 'error',
    statusCode: 502,
    code: 'SPOTIFY_OUTCOME_UNKNOWN',
    message: 'raw',
    details: { operation: 'createPlaylist', category: 'timeout', status: null },
  },
  incomplete: {
    type: 'error',
    statusCode: 502,
    code: 'SPOTIFY_PLAYLIST_INCOMPLETE',
    message: 'raw',
    details: {
      spotifyId: 'created-1',
      spotifyUrl: 'https://open.spotify.com/playlist/created-1',
      failedStep: 'add_tracks',
      tracksAdded: 'unknown',
    },
  },
  reauth: {
    type: 'error',
    statusCode: 401,
    code: 'SPOTIFY_REAUTH_REQUIRED',
    message: 'raw',
  },
  'rate-limit-spotify-wait': {
    type: 'error',
    statusCode: 429,
    code: 'SPOTIFY_RATE_LIMITED',
    message: 'raw',
    details: { retryAfterSeconds: 7, retryAfterSource: 'spotify', reason: 'rate_limit' },
  },
  'rate-limit-blendify-estimate': {
    type: 'error',
    statusCode: 429,
    code: 'SPOTIFY_RATE_LIMITED',
    message: 'raw',
    details: { retryAfterSeconds: 20, retryAfterSource: 'blendify', reason: 'rate_limit' },
  },
  'cover-failed': {
    type: 'result',
    playlist: { ...spotifyJazzPlaylist, coverUploadFailed: true },
  },
}

const EXPECTED_ACTION: Record<string, string | null> = {
  retryable: 'button',
  'retryable-spotify-wait': 'button',
  'connection-lost': 'button',
  unconfirmed: 'button',
  incomplete: 'link',
  reauth: 'button',
  'rate-limit-spotify-wait': 'button',
  'rate-limit-blendify-estimate': 'button',
  'cover-failed': null,
}

async function openMixWith(page: Page, locale: string, event: StreamEvent) {
  await mockAuthenticatedSession(page)
  await mockGenres(page)
  await mockEmptyLibrary(page)
  await page.route('**/api/playlists/mix', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: `${JSON.stringify(event)}\n`,
    }),
  )
  await page.goto(`/app/mix?lang=${locale}`)
  await page
    .getByRole('group')
    .filter({ has: page.locator('input[type="radio"]') })
    .first()
    .locator('label')
    .nth(1)
    .click()
  await page.getByRole('button', { name: /Jazz/ }).click()
  await page.locator('form button[type="submit"]').click()
}

async function capture(page: Page, name: string) {
  await page.waitForFunction('document.fonts.status === "loaded"')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow, `${name} scrolls horizontally`).toBeLessThanOrEqual(0)
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/${name}.png`,
    fullPage: true,
    animations: 'disabled',
  })
}

async function reachByTab(page: Page, selector: string): Promise<boolean> {
  await page.locator('body').click({ position: { x: 1, y: 1 } })
  for (let step = 0; step < 60; step += 1) {
    await page.keyboard.press('Tab')
    if (await page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector)) {
      return true
    }
  }
  return false
}

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    for (const [state, event] of Object.entries(STATES)) {
      test(`${state} · ${locale} · ${viewport.name}`, async ({ page }) => {
        test.skip(test.info().project.name !== 'desktop', 'Each case sets its own viewport')
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await openMixWith(page, locale, event)

        const actionKind = EXPECTED_ACTION[state]
        if (actionKind === null) {
          await expect(page.getByRole('heading', { name: 'Blendify · Mix · Jazz' })).toBeVisible()
        }
        if (actionKind === 'link') {
          const link = page.locator('a[href="https://open.spotify.com/playlist/created-1"]')
          await expect(link).toBeVisible()
          expect(await reachByTab(page, 'a[href="https://open.spotify.com/playlist/created-1"]')).toBe(true)
        }
        if (actionKind === 'button') {
          const alert = page.getByRole('alert').first()
          await expect(alert).toBeVisible()
          const action = alert
            .locator('xpath=following-sibling::*/descendant-or-self::button[not(@aria-controls)]')
            .first()
          await expect(action).toBeVisible()
          await action.evaluate((element) => element.setAttribute('data-review-action', ''))
          expect(await reachByTab(page, '[data-review-action]')).toBe(true)
        }

        await capture(page, `${locale}/${viewport.name}/${state}`)

        if (state.startsWith('rate-limit')) {
          const explanationToggle = page.locator('button[aria-controls][aria-expanded]')
          await expect(explanationToggle).toHaveAttribute('aria-expanded', 'false')
          await explanationToggle.click()
          await expect(explanationToggle).toHaveAttribute('aria-expanded', 'true')
          await capture(page, `${locale}/${viewport.name}/${state}-explained`)
        }
      })
    }
  }
}
