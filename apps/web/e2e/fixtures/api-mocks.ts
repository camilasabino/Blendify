import type { Page, Route } from '@playwright/test'
import type { GenreDto, UserDto } from '@blendify/contracts'

export const testUser: UserDto = {
  id: 'user-1',
  displayName: 'Camila',
  email: null,
  imageUrl: null,
}

export async function mockGuestSession(page: Page): Promise<void> {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { user: null } }),
  )
}

export async function mockAuthenticatedSession(
  page: Page,
  user: UserDto = testUser,
): Promise<void> {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { user } }),
  )
}

export async function mockLogout(page: Page): Promise<void> {
  await page.route('**/api/auth/logout', (route) =>
    route.fulfill({ json: { ok: true } }),
  )
}

export async function mockGenres(
  page: Page,
  genres: GenreDto[] = [{ id: 'jazz', name: 'Jazz' }],
): Promise<void> {
  await page.route('**/api/genres', (route) => route.fulfill({ json: { genres } }))
}

export async function mockEmptyLibrary(page: Page): Promise<void> {
  await page.route(/\/api\/playlists(\?.*)?$/, (route) =>
    route.fulfill({
      json: { playlists: [], total: 0, limit: 10, offset: 0 },
    }),
  )
  await page.route('**/api/playlists/sync', (route) =>
    route.fulfill({ json: { checkedCount: 0, removedCount: 0 } }),
  )
}

function ndjsonBody(events: readonly unknown[]): string {
  return `${events.map((event) => JSON.stringify(event)).join('\n')}\n`
}

/**
 * Holds a generation endpoint open until the test releases it, then fulfils
 * it with real progress + result NDJSON events (not a JSON shortcut). Gating
 * the response is what makes the "working" UI state observable: a mocked
 * response is otherwise served fast enough that React never paints it
 * between the submit and the terminal result.
 */
export function mockGenerationStream(
  page: Page,
  url: string,
  events: readonly unknown[],
): { release: () => void } {
  let releaseGate: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve
  })
  void page.route(url, async (route: Route) => {
    await gate
    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body: ndjsonBody(events),
      })
    } catch {
      // The request may already be gone (e.g. aborted by a logout mid-flight).
    }
  })
  return { release: () => releaseGate() }
}

/**
 * Leaves a generation request pending indefinitely, so a logout can be
 * triggered while the request is genuinely in flight.
 */
export function mockPendingGeneration(
  page: Page,
  url: string,
): { release: () => void } {
  return mockGenerationStream(page, url, [])
}
