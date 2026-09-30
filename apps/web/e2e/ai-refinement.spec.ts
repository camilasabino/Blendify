import type { Page, Request, Route } from '@playwright/test'
import type { AiRefinementDto, AiSessionStateDto } from '@blendify/contracts'
import { expect, test } from './fixtures/test'
import { mockAuthenticatedSession, mockGuestSession } from './fixtures/api-mocks'
import {
  AI_REFINEMENT_ID,
  AI_REVIEW_PROMPT,
  AI_REVIEW_ACCESS_KEY,
  AI_REVIEW_SESSION_ID,
  appliedState,
  candidateRefinement,
  generatedState,
  pendingState,
  refinementResult,
  settingsOnlyRefinement,
} from './fixtures/ai-sessions'

const SESSION_URL = `**/api/ai/sessions/${AI_REVIEW_SESSION_ID}`
const REFINE_URL = `${SESSION_URL}/refinements`
const TITLE = 'Blendify · Mix · Radiohead + Interpol'

type ServerSession = { state: AiSessionStateDto }

function trackRequests(page: Page, pattern: RegExp): Request[] {
  const requests: Request[] = []
  page.on('request', (request) => {
    if (pattern.test(new URL(request.url()).pathname)) {
      requests.push(request)
    }
  })
  return requests
}

async function restore(page: Page, server: ServerSession, title: string | null = null) {
  const stored = JSON.stringify({
    sessionId: AI_REVIEW_SESSION_ID,
    accessKey: AI_REVIEW_ACCESS_KEY,
    prompt: AI_REVIEW_PROMPT,
    playlistTitle: title,
  })
  await page.addInitScript({
    content: `sessionStorage.setItem('blendify.aiSession', ${JSON.stringify(stored)})`,
  })
  await page.route(SESSION_URL, (route) => route.fulfill({ json: server.state }))
}

async function routeRefinements(
  page: Page,
  server: ServerSession,
  next: () => AiRefinementDto,
) {
  await page.route(REFINE_URL, (route) => {
    if (server.state.refinement) {
      return route.fulfill({
        status: 409,
        json: { statusCode: 409, code: 'AI_REFINEMENT_PENDING', message: 'pending' },
      })
    }
    const refinement = next()
    server.state = { ...server.state, refinement }
    return route.fulfill({ json: refinementResult(refinement) })
  })
}

async function routeSettlement(page: Page, server: ServerSession) {
  await page.route(`${REFINE_URL}/*/*`, (route: Route) => {
    const [, id, action] = /refinements\/([^/]+)\/(apply|dismiss)$/.exec(
      new URL(route.request().url()).pathname,
    ) ?? ['', '', '']
    const pending = server.state.refinement
    if (!pending || pending.id !== id) {
      return route.fulfill({
        status: 409,
        json: { statusCode: 409, code: 'AI_REFINEMENT_STALE', message: 'stale' },
      })
    }
    server.state =
      action === 'apply' && pending.status === 'candidate_ready'
        ? appliedState(pending, server.state)
        : { ...server.state, refinement: null }
    return route.fulfill({ json: server.state })
  })
}

async function submitRefinement(page: Page, text: string) {
  await page.getByRole('button', { name: 'Refine playlist' }).click()
  const textarea = page.getByRole('textbox', { name: 'What would you like to change?' })
  await expect(textarea).toBeFocused()
  await textarea.fill(text)
  await page.getByRole('button', { name: 'Propose changes' }).click()
}

test.describe('Create with AI refinement', () => {
  test('a stale tab cannot replace a pending refinement and loads it for review instead', async ({
    page,
  }) => {
    await mockGuestSession(page)
    const server: ServerSession = { state: generatedState() }
    const pendingFromOtherTab = candidateRefinement()
    await restore(page, server)
    await routeRefinements(page, server, () => candidateRefinement(undefined, 'refinement-c'))
    await routeSettlement(page, server)
    const refinements = trackRequests(page, /\/refinements$/)
    await page.goto('/app/ai')
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible()
    server.state = { ...server.state, refinement: pendingFromOtherTab }

    await submitRefinement(page, 'Make it less mainstream')

    await expect(page.getByRole('heading', { name: 'Proposed changes' })).toBeFocused()
    await expect(
      page.getByText(
        'Another change to this playlist is waiting for your review. Apply or dismiss it before refining again.',
      ),
    ).toBeVisible()
    expect(refinements).toHaveLength(1)
    expect(
      refinements[0].url().includes(AI_REVIEW_ACCESS_KEY),
      'session key must not appear in the request URL',
    ).toBe(false)
    expect(
      (await refinements[0].headerValue('x-ai-session-key')) === AI_REVIEW_ACCESS_KEY,
      'Expected the X-Ai-Session-Key header to match the fixture key',
    ).toBe(true)
    expect(server.state.refinement).toBe(pendingFromOtherTab)

    await page.getByRole('button', { name: 'Apply changes' }).click()

    await expect(page.getByRole('heading', { name: TITLE })).toBeFocused()
    await expect(page.getByRole('button', { name: 'Refine playlist' })).toBeVisible()
    expect(server.state.refinement).toBeNull()
  })

  test('Guest refines, reviews the diff and applies the candidate, then destinations return', async ({
    page,
  }) => {
    await mockGuestSession(page)
    const server: ServerSession = { state: generatedState() }
    const candidate = candidateRefinement()
    await restore(page, server)
    await routeRefinements(page, server, () => candidate)
    await routeSettlement(page, server)
    const refinements = trackRequests(page, /\/refinements$/)
    const settlements = trackRequests(page, /\/(apply|dismiss)$/)
    await page.goto('/app/ai')
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible()

    await submitRefinement(page, 'More popular, add Argentine rock')

    await expect(page.getByRole('heading', { name: 'Proposed changes' })).toBeFocused()
    await expect(page.getByText('Argentine Rock', { exact: false }).first()).toBeVisible()
    await expect(page.getByRole('list', { name: 'Songs in the proposed playlist' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Prepare transfer' })).toHaveCount(0)
    await expect(
      page.getByText('Finish or dismiss the current refinement before saving this playlist.'),
    ).toBeVisible()
    expect(refinements).toHaveLength(1)
    expect(refinements[0].postDataJSON()).toEqual({ refinement: 'More popular, add Argentine rock' })

    await page.getByRole('button', { name: 'Apply changes' }).click()

    await expect(page.getByRole('heading', { name: TITLE })).toBeFocused()
    await expect(page.getByRole('heading', { name: 'Proposed changes' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Prepare transfer' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Refine playlist' })).toBeVisible()
    await page.getByRole('button', { name: /Show all/ }).click()
    await expect(page.getByText('Proposed Horizon 1')).toBeVisible()
    expect(settlements).toHaveLength(1)
    expect(settlements[0].postData()).toBeNull()
    expect(new URL(settlements[0].url()).pathname).toContain(`/${AI_REFINEMENT_ID}/apply`)
  })

  test('Cancel keeps the current playlist and restores destinations', async ({ page }) => {
    await mockGuestSession(page)
    const server: ServerSession = { state: pendingState(candidateRefinement()) }
    await restore(page, server)
    await routeSettlement(page, server)
    await page.goto('/app/ai')

    await page.getByRole('button', { name: 'Cancel' }).click()

    await expect(page.getByRole('button', { name: 'Refine playlist' })).toBeFocused()
    await expect(page.getByRole('button', { name: 'Prepare transfer' })).toBeVisible()
    await expect(page.getByText('Proposed Horizon 1')).toHaveCount(0)
  })

  test('refines again after Apply from the applied playlist', async ({ page }) => {
    await mockGuestSession(page)
    const server: ServerSession = { state: generatedState() }
    const second = { id: 'e2e-refinement-2', status: 'unchanged' } as const
    const responses: AiRefinementDto[] = [candidateRefinement(), second]
    await restore(page, server)
    await routeRefinements(page, server, () => responses.shift() ?? second)
    await routeSettlement(page, server)
    const refinements = trackRequests(page, /\/refinements$/)
    await page.goto('/app/ai')

    await submitRefinement(page, 'More popular')
    await page.getByRole('button', { name: 'Apply changes' }).click()
    await expect(page.getByRole('button', { name: 'Refine playlist' })).toBeVisible()
    await submitRefinement(page, 'Make it popular')

    await expect(page.getByRole('heading', { name: 'No changes needed' })).toBeFocused()
    expect(refinements.map((request) => request.postDataJSON())).toEqual([
      { refinement: 'More popular' },
      { refinement: 'Make it popular' },
    ])
    await page.getByRole('button', { name: 'Show all 20 songs' }).click()
    await expect(page.getByText('Proposed Horizon 1')).toBeVisible()
  })

  test('a clarification keeps the current playlist and returns to the composer', async ({ page }) => {
    await mockGuestSession(page)
    const server: ServerSession = { state: generatedState() }
    await restore(page, server)
    await routeRefinements(page, server, () => ({
      id: AI_REFINEMENT_ID,
      status: 'needs_clarification',
      clarification: {
        reason: 'preserved_artist_not_found',
        seedType: null,
        limit: null,
        names: ['Björk'],
        unsupportedConstraints: [],
      },
    }))
    await routeSettlement(page, server)
    await page.goto('/app/ai')

    await submitRefinement(page, 'Keep the Björk songs')

    await expect(page.getByRole('heading', { name: 'This change needs another try' })).toBeFocused()
    await expect(
      page.getByText('There are no songs by Björk in the current playlist to keep.'),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apply changes' })).toHaveCount(0)
    await expect(page.getByRole('list', { name: 'Songs in this playlist' })).toBeVisible()

    await page.getByRole('button', { name: 'Try a different refinement' }).click()
    const textarea = page.getByRole('textbox', { name: 'What would you like to change?' })
    await expect(textarea).toBeFocused()
    await expect(textarea).toHaveValue('Keep the Björk songs')
  })

  test('an unchanged refinement says so and continues with the current playlist', async ({
    page,
  }) => {
    await mockGuestSession(page)
    const server: ServerSession = { state: generatedState() }
    await restore(page, server)
    await routeRefinements(page, server, () => ({ id: AI_REFINEMENT_ID, status: 'unchanged' }))
    await routeSettlement(page, server)
    await page.goto('/app/ai')

    await submitRefinement(page, 'Keep it as deep cuts')
    await expect(page.getByRole('heading', { name: 'No changes needed' })).toBeFocused()
    await page.getByRole('button', { name: 'Continue with current playlist' }).click()

    await expect(page.getByRole('button', { name: 'Prepare transfer' })).toBeVisible()
    expect(server.state.refinement).toBeNull()
  })

  test('a settings-only proposal says no song changes and Apply saves the rule', async ({
    page,
  }) => {
    await mockGuestSession(page)
    const server: ServerSession = { state: generatedState() }
    await restore(page, server)
    await routeRefinements(page, server, () => settingsOnlyRefinement())
    await routeSettlement(page, server)
    const settlements = trackRequests(page, /\/(apply|dismiss)$/)
    await page.goto('/app/ai')

    await submitRefinement(page, 'Excluir a Coldplay')

    await expect(page.getByRole('heading', { name: 'Proposed changes' })).toBeFocused()
    await expect(
      page.getByText(
        'No songs would change. Apply to save these settings, and Blendify will follow them in your next changes.',
      ),
    ).toBeVisible()
    await expect(page.getByText('Your current songs stay the same.')).toBeVisible()
    await expect(page.getByRole('list', { name: 'Songs in the proposed playlist' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Apply changes' }).click()

    await expect(page.getByRole('button', { name: 'Prepare transfer' })).toBeVisible()
    expect(settlements).toHaveLength(1)
    expect(server.state.intent?.excludeArtists).toContain('Coldplay')
  })

  test('a genre exclusion is explained as unsupported and offers no Apply', async ({ page }) => {
    await mockGuestSession(page)
    const server: ServerSession = { state: generatedState() }
    await restore(page, server)
    await routeRefinements(page, server, () => ({
      id: AI_REFINEMENT_ID,
      status: 'needs_clarification',
      clarification: {
        reason: 'unsupported_constraint',
        seedType: null,
        limit: null,
        names: [],
        unsupportedConstraints: [{ category: 'genre_exclusion', userText: 'sin canciones de rock' }],
      },
    }))
    await routeSettlement(page, server)
    await page.goto('/app/ai')

    await submitRefinement(page, 'Sin canciones de rock')

    await expect(page.getByRole('heading', { name: 'This change needs another try' })).toBeFocused()
    await expect(page.getByText(/can’t reliably exclude songs by genre yet/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apply changes' })).toHaveCount(0)
  })

  test('a failed candidate keeps the current playlist and can be dismissed', async ({ page }) => {
    await mockGuestSession(page)
    const candidate = candidateRefinement()
    const server: ServerSession = {
      state: pendingState({
        id: AI_REFINEMENT_ID,
        status: 'candidate_failed',
        intent: candidate.intent,
        preservation: candidate.preservation,
        notApplied: [],
        error: {
          code: 'CATALOG_UNAVAILABLE',
          category: 'provider_unavailable',
          retryAfterSeconds: null,
          seedNotFound: null,
        },
      }),
    }
    await restore(page, server)
    await routeSettlement(page, server)
    await page.goto('/app/ai')

    await expect(page.getByRole('heading', { name: 'Couldn’t prepare these changes' })).toBeVisible()
    await expect(page.getByText('Your current playlist hasn’t changed.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apply changes' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Prepare transfer' })).toHaveCount(0)
    await expect(page.getByRole('list', { name: 'Songs in this playlist' })).toBeVisible()
    await page.getByRole('button', { name: 'Dismiss' }).click()
    await expect(page.getByRole('button', { name: 'Refine playlist' })).toBeFocused()
    await expect(page.getByRole('button', { name: 'Prepare transfer' })).toBeEnabled()
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible()
    expect(server.state.refinement).toBeNull()
  })

  test('a stale tab cannot dismiss a newer pending refinement', async ({ page }) => {
    await mockGuestSession(page)
    const server: ServerSession = { state: pendingState(candidateRefinement()) }
    await restore(page, server)
    await routeSettlement(page, server)
    await page.goto('/app/ai')
    await expect(page.getByRole('heading', { name: 'Proposed changes' })).toBeVisible()
    server.state = pendingState({ id: 'e2e-refinement-newer', status: 'unchanged' })

    await page.getByRole('button', { name: 'Cancel' }).click()

    await expect(page.getByRole('heading', { name: 'No changes needed' })).toBeFocused()
    await expect(
      page.getByText(
        'That proposal is no longer current. Blendify loaded the latest version of your playlist.',
      ),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Proposed changes' })).toHaveCount(0)
    expect(server.state.refinement?.id).toBe('e2e-refinement-newer')
  })

  test('restores a pending candidate without submitting, applying or regenerating', async ({
    page,
  }) => {
    await mockGuestSession(page)
    const server: ServerSession = { state: pendingState(candidateRefinement()) }
    const writes = trackRequests(page, /\/(refinements|apply|dismiss|generate|publish|transfer)$/)
    await restore(page, server)
    await page.goto('/app/ai')

    await expect(page.getByRole('heading', { name: 'Proposed changes' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apply changes' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Prepare transfer' })).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Proposed changes' })).toBeVisible()
    expect(writes).toHaveLength(0)
  })

  test('a stale tab cannot apply a newer pending refinement', async ({ page }) => {
    await mockGuestSession(page)
    const server: ServerSession = { state: pendingState(candidateRefinement()) }
    await restore(page, server)
    await routeSettlement(page, server)
    await page.goto('/app/ai')
    await expect(page.getByRole('heading', { name: 'Proposed changes' })).toBeVisible()
    const newer = candidateRefinement(generatedState(), 'e2e-refinement-newer')
    server.state = pendingState(newer)

    await page.getByRole('button', { name: 'Apply changes' }).click()

    await expect(
      page.getByText(
        'That proposal is no longer current. Blendify loaded the latest version of your playlist.',
      ),
    ).toBeVisible()
    expect(server.state.refinement?.id).toBe('e2e-refinement-newer')
    await expect(page.getByRole('heading', { name: 'Proposed changes' })).toBeVisible()
  })

  test('Spotify Mode keeps the edited title through Apply and saves the applied playlist under it', async ({
    page,
  }) => {
    await mockAuthenticatedSession(page)
    const server: ServerSession = { state: generatedState() }
    await restore(page, server)
    await routeRefinements(page, server, () => candidateRefinement())
    await routeSettlement(page, server)
    const publishes = trackRequests(page, /\/publish$/)
    await page.route(`${SESSION_URL}/publish`, (route) =>
      route.fulfill({
        json: {
          ...server.state,
          destination: {
            status: 'published',
            spotifyUrl: 'https://open.spotify.com/playlist/e2e',
            savedToLibrary: true,
          },
        },
      }),
    )
    await page.goto('/app/ai')

    await page.getByRole('button', { name: 'Edit title' }).click()
    await page.getByRole('textbox', { name: 'Playlist title' }).fill('Night run')
    await page.getByRole('button', { name: 'Done' }).click()
    await submitRefinement(page, 'More popular')
    await expect(page.getByRole('button', { name: 'Save to Spotify' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Apply changes' }).click()

    await expect(page.getByRole('heading', { name: 'Night run' })).toBeFocused()
    await page.getByRole('button', { name: 'Save to Spotify' }).click()
    await expect(page.getByRole('heading', { name: 'Saved to Spotify' })).toBeVisible()
    expect(publishes).toHaveLength(1)
    expect(publishes[0].postDataJSON()).toMatchObject({ name: 'Night run' })
    expect(publishes[0].postDataJSON()).not.toHaveProperty('tracks')
  })
})
