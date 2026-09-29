import type { Page, Request } from '@playwright/test'
import type { AiSessionStateDto } from '@blendify/contracts'
import { expect, test } from './fixtures/test'
import {
  mockAuthenticatedSession,
  mockGenerationStream,
  mockGuestSession,
} from './fixtures/api-mocks'
import {
  AI_REVIEW_PROMPT,
  AI_REVIEW_ACCESS_KEY,
  AI_REVIEW_SESSION_ID,
  generatedState,
  reviewedState,
} from './fixtures/ai-sessions'

const SESSION_URL = `**/api/ai/sessions/${AI_REVIEW_SESSION_ID}`
const SPOTIFY_URL = 'https://open.spotify.com/playlist/e2e-ai-playlist'
const SOUNDIIZ_URL = 'https://soundiiz.com/go/import-playlist/e2eaitransfer0001'

function destinationRequests(page: Page): Request[] {
  const requests: Request[] = []
  page.on('request', (request) => {
    if (/\/api\/ai\/sessions\/[^/]+\/(publish|transfer)$/.test(new URL(request.url()).pathname)) {
      requests.push(request)
    }
  })
  return requests
}

function generation(state: AiSessionStateDto) {
  if (state.execution?.status !== 'generated' || !state.intent) {
    throw new Error('Expected a generated session fixture')
  }
  const { playlist, trackCount, durationMs, unmetConstraints, transferAvailable } =
    state.execution
  return {
    sessionId: state.sessionId,
    expiresAt: state.expiresAt,
    status: 'generated' as const,
    intent: state.intent,
    playlist,
    trackCount,
    durationMs,
    unmetConstraints,
    transferAvailable,
  }
}

async function generateLive(page: Page) {
  const reviewed = reviewedState()
  await page.route('**/api/ai/sessions', (route) =>
    route.fulfill({ status: 201, json: { ...reviewed, accessKey: AI_REVIEW_ACCESS_KEY, execution: undefined, destination: undefined, preservation: undefined, refinement: undefined } }),
  )
  const stream = mockGenerationStream(page, `${SESSION_URL}/generate`, [
    { type: 'result', playlist: generation(generatedState()) },
  ])
  await page.goto('/app/ai')
  await page.getByRole('textbox', { name: 'Playlist request' }).fill(AI_REVIEW_PROMPT)
  await page.getByRole('button', { name: 'Review request' }).click()
  await page.getByRole('button', { name: 'Create playlist' }).click()
  stream.release()
  await expect(
    page.getByRole('heading', { name: 'Blendify · Mix · Radiohead + Interpol' }),
  ).toBeVisible()
}

test.describe('Create with AI destinations', () => {
  test('Guest prepares one Soundiiz transfer only after the explicit action', async ({ page }) => {
    await mockGuestSession(page)
    const requests = destinationRequests(page)
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(`${SESSION_URL}/transfer`, async (route) => {
      await gate
      await route.fulfill({
        json: generatedState({
          destination: {
            status: 'transfer_prepared',
            transfer: { url: SOUNDIIZ_URL, expiresAt: '2099-01-01T00:00:00.000Z', trackCount: 20 },
          },
        }),
      })
    })

    await generateLive(page)
    await expect(page.getByRole('button', { name: 'Save to Spotify' })).toHaveCount(0)
    expect(requests).toHaveLength(0)

    const prepare = page.getByRole('button', { name: 'Prepare transfer' })
    await prepare.dblclick()
    await expect(page.getByRole('button', { name: 'Preparing transfer…' })).toBeDisabled()
    release()

    const link = page.getByRole('link', { name: /Continue on Soundiiz/ })
    await expect(link).toHaveAttribute('href', SOUNDIIZ_URL)
    await expect(link).toHaveAttribute('target', '_blank')
    expect(requests).toHaveLength(1)
    expect(requests[0].postDataJSON()).toEqual({ name: 'Blendify · Mix · Radiohead + Interpol' })
  })

  test('Spotify Mode saves the preview once under the edited title', async ({ page }) => {
    await mockAuthenticatedSession(page)
    const requests = destinationRequests(page)
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(`${SESSION_URL}/publish`, async (route) => {
      await gate
      await route.fulfill({
        json: generatedState({
          destination: { status: 'published', spotifyUrl: SPOTIFY_URL, savedToLibrary: true },
        }),
      })
    })

    await generateLive(page)
    await expect(page.getByRole('button', { name: 'Prepare transfer' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Edit title' }).click()
    await page.getByRole('textbox', { name: 'Playlist title' }).fill('Long run mix')
    await page.getByRole('button', { name: 'Done' }).click()
    expect(requests).toHaveLength(0)

    await page.getByRole('button', { name: 'Save to Spotify' }).dblclick()
    await expect(page.getByRole('button', { name: 'Saving to Spotify…' })).toBeDisabled()
    release()

    await expect(page.getByRole('heading', { name: 'Saved to Spotify' })).toBeFocused()
    await expect(page.getByRole('link', { name: /Open in Spotify/ })).toHaveAttribute(
      'href',
      SPOTIFY_URL,
    )
    await expect(page.getByRole('heading', { name: 'Long run mix' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit title' })).toHaveCount(0)
    expect(requests).toHaveLength(1)
    expect(requests[0].postDataJSON()).toMatchObject({
      name: 'Long run mix',
      persistToLibrary: true,
    })
  })

  test('Spotify Mode asks to reconnect after a revoked authorization and never publishes on return', async ({
    page,
  }) => {
    await mockAuthenticatedSession(page)
    const requests = destinationRequests(page)
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
    await page.route(SESSION_URL, (route) => route.fulfill({ json: generatedState() }))

    await generateLive(page)
    await page.getByRole('button', { name: 'Save to Spotify' }).click()

    await expect(page.getByRole('alert').filter({ hasText: 'connect again' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save to Spotify' })).toHaveCount(0)
    await expect(page.getByRole('list', { name: 'Songs in this playlist' })).toBeVisible()
    expect(requests).toHaveLength(1)

    const reconnect = page.getByRole('main').getByRole('button', { name: 'Connect Spotify' })
    await expect(reconnect).toBeFocused()
    const callbackUrl = new URL('/app/mix', page.url()).href
    await page.route('**/api/auth/spotify', (route) =>
      route.fulfill({ status: 302, headers: { location: callbackUrl } }),
    )
    const oauth = page.waitForRequest('**/api/auth/spotify')
    await page.keyboard.press('Enter')
    await oauth
    await page.waitForURL(new URL('/app/ai', page.url()).href)

    await expect(page.getByRole('button', { name: 'Save to Spotify' })).toBeEnabled()
    await expect(
      page.getByRole('heading', { name: 'Blendify · Mix · Radiohead + Interpol' }),
    ).toBeVisible()
    expect(requests).toHaveLength(1)
  })
})
