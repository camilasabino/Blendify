import type { Page, Request, Route } from '@playwright/test'
import type { AiSessionStateDto } from '@blendify/contracts'
import { expect, test } from './fixtures/test'
import { mockGuestSession } from './fixtures/api-mocks'
import {
  AI_REVIEW_ACCESS_KEY,
  AI_REVIEW_PROMPT,
  AI_REVIEW_SESSION_ID,
  failedState,
  generatedState,
  reviewedState,
} from './fixtures/ai-sessions'

const CREATE_URL = '**/api/ai/sessions'
const SESSION_URL = `**/api/ai/sessions/${AI_REVIEW_SESSION_ID}`
const TITLE = 'Blendify · Mix · Radiohead + Interpol'
const PROVIDER_FAILURE = {
  code: 'CATALOG_UNAVAILABLE',
  category: 'provider_unavailable',
  retryAfterSeconds: null,
  seedNotFound: null,
} as const

function trackRequests(page: Page, method: string, pattern: RegExp): Request[] {
  const requests: Request[] = []
  page.on('request', (request) => {
    if (request.method() === method && pattern.test(new URL(request.url()).pathname)) {
      requests.push(request)
    }
  })
  return requests
}

function createdSession() {
  return {
    ...reviewedState(),
    accessKey: AI_REVIEW_ACCESS_KEY,
    execution: undefined,
    destination: undefined,
    preservation: undefined,
    refinement: undefined,
  }
}

function generationResult(state: AiSessionStateDto) {
  if (state.execution?.status !== 'generated' || !state.intent) {
    throw new Error('Expected a generated session fixture')
  }
  const { playlist, trackCount, durationMs, unmetConstraints, transferAvailable } = state.execution
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

function ndjson(route: Route, events: readonly unknown[]) {
  return route.fulfill({
    status: 200,
    contentType: 'application/x-ndjson',
    body: `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
  })
}

async function submitPrompt(page: Page) {
  await page.getByRole('textbox', { name: 'Playlist request' }).fill(AI_REVIEW_PROMPT)
  await page.getByRole('button', { name: 'Review request' }).click()
}

test.describe('Create with AI failure recovery', () => {
  test('an interpretation timeout waits for an explicit Retry before asking again', async ({
    page,
  }) => {
    await mockGuestSession(page)
    const interpretations = trackRequests(page, 'POST', /\/api\/ai\/sessions$/)
    let attempts = 0
    await page.route(CREATE_URL, (route) => {
      attempts += 1
      if (attempts === 1) {
        return route.fulfill({
          status: 504,
          json: { statusCode: 504, code: 'AI_TIMEOUT', message: 'Create with AI took too long.' },
        })
      }
      return route.fulfill({ status: 201, json: createdSession() })
    })
    await page.goto('/app/ai')

    await submitPrompt(page)

    await expect(page.getByRole('alert')).toHaveText(
      'Reading your request took too long. Try again.',
    )
    await expect(page.getByRole('textbox', { name: 'Playlist request' })).toHaveValue(
      AI_REVIEW_PROMPT,
    )
    await page.waitForTimeout(500)
    expect(interpretations).toHaveLength(1)

    await page.getByRole('button', { name: 'Try again' }).click()

    await expect(page.getByRole('heading', { name: 'Here’s what Blendify understood' })).toBeFocused()
    await expect(page.getByRole('button', { name: 'Create preview' })).toBeEnabled()
    expect(interpretations.map((request) => request.postDataJSON())).toEqual([
      { prompt: AI_REVIEW_PROMPT },
      { prompt: AI_REVIEW_PROMPT },
    ])
  })

  test('a provider failure keeps the reviewed request and retries generation without reading it again', async ({
    page,
  }) => {
    await mockGuestSession(page)
    const interpretations = trackRequests(page, 'POST', /\/api\/ai\/sessions$/)
    const generations = trackRequests(page, 'POST', /\/generate$/)
    const server = { state: reviewedState(), attempts: 0 }
    await page.route(CREATE_URL, (route) => route.fulfill({ status: 201, json: createdSession() }))
    await page.route(SESSION_URL, (route) => route.fulfill({ json: server.state }))
    await page.route(`${SESSION_URL}/generate`, (route) => {
      server.attempts += 1
      if (server.attempts === 1) {
        server.state = failedState(PROVIDER_FAILURE)
        return ndjson(route, [
          {
            type: 'error',
            statusCode: 503,
            code: 'CATALOG_UNAVAILABLE',
            message: 'Catalog provider detail',
          },
        ])
      }
      server.state = generatedState()
      return ndjson(route, [{ type: 'result', playlist: generationResult(server.state) }])
    })
    await page.goto('/app/ai')
    await submitPrompt(page)
    await page.getByRole('button', { name: 'Create preview' }).click()

    await expect(page.getByRole('heading', { name: 'Couldn’t create your playlist' })).toBeFocused()
    await expect(page.getByRole('alert')).toHaveText(
      'Spotify isn’t responding right now. Try again in a few minutes.',
    )
    await expect(page.getByText('Catalog provider detail')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Here’s what Blendify understood' })).toBeVisible()

    await page.getByRole('button', { name: 'Try again' }).click()

    await expect(page.getByRole('heading', { name: TITLE })).toBeFocused()
    expect(generations).toHaveLength(2)
    expect(interpretations).toHaveLength(1)
  })

  test('an expired stored session returns to the composer with the request kept for a new start', async ({
    page,
  }) => {
    await mockGuestSession(page)
    const stored = JSON.stringify({
      sessionId: AI_REVIEW_SESSION_ID,
      accessKey: AI_REVIEW_ACCESS_KEY,
      prompt: AI_REVIEW_PROMPT,
      playlistTitle: 'Night run',
    })
    await page.addInitScript({
      content: `sessionStorage.setItem('blendify.aiSession', ${JSON.stringify(stored)})`,
    })
    const interpretations = trackRequests(page, 'POST', /\/api\/ai\/sessions$/)
    await page.route(SESSION_URL, (route) =>
      route.fulfill({
        status: 404,
        json: { statusCode: 404, code: 'AI_SESSION_NOT_FOUND', message: 'Session detail' },
      }),
    )
    await page.route(CREATE_URL, (route) => route.fulfill({ status: 201, json: createdSession() }))
    await page.goto('/app/ai')

    await expect(page.getByRole('alert')).toHaveText(
      'This session expired. Submit your request again to start a new one.',
    )
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: 'Playlist request' })).toHaveValue(
      AI_REVIEW_PROMPT,
    )
    expect(await page.evaluate(() => sessionStorage.getItem('blendify.aiSession'))).toBeNull()
    expect(interpretations).toHaveLength(0)

    await page.getByRole('button', { name: 'Review request' }).click()

    await expect(page.getByRole('heading', { name: 'Here’s what Blendify understood' })).toBeVisible()
    expect(interpretations).toHaveLength(1)
    expect(interpretations[0].postDataJSON()).toEqual({ prompt: AI_REVIEW_PROMPT })
  })
})
