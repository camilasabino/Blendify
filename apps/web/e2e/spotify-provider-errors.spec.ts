import type { Page, Route } from '@playwright/test'
import { expect, test } from './fixtures/test'
import {
  mockAuthenticatedSession,
  mockEmptyLibrary,
  mockGenres,
} from './fixtures/api-mocks'
import { spotifyJazzPlaylist } from './fixtures/playlists'

type StreamEvent = Record<string, unknown>

const seedTrack = {
  id: 'beso-track',
  name: 'Un Beso en la Nariz',
  artistId: 'artist-beso',
  artistName: 'Seed Artist',
  artists: [{ id: 'artist-beso', name: 'Seed Artist' }],
  albumName: 'Seed Album',
  albumImageUrl: null,
  durationMs: 200_000,
  popularity: 40,
  uri: 'spotify:track:beso-track',
  externalUrl: 'https://open.spotify.com/track/beso-track',
}

const discoverPlaylist = {
  ...spotifyJazzPlaylist,
  name: 'Blendify · Discover · Un Beso en la Nariz',
  kind: 'discover_track',
  seeds: [
    {
      type: 'track',
      id: seedTrack.id,
      name: seedTrack.name,
      artistId: seedTrack.artistId,
      artistName: seedTrack.artistName,
    },
  ],
  generation: {
    version: 1,
    kind: 'discover_track',
    targetTrackCount: 10,
    popularity: 'balanced',
    orderMode: 'random',
    seed: {
      id: seedTrack.id,
      name: seedTrack.name,
      artistId: seedTrack.artistId,
      artistName: seedTrack.artistName,
    },
  },
}

function ndjson(events: StreamEvent[]): string {
  return `${events.map((event) => JSON.stringify(event)).join('\n')}\n`
}

function scriptGeneration(
  page: Page,
  url: string,
  replies: StreamEvent[][],
): { bodies: unknown[]; releaseFirst: () => void } {
  const bodies: unknown[] = []
  let releaseFirst: () => void = () => {}
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  void page.route(url, async (route: Route) => {
    bodies.push(route.request().postDataJSON())
    const events = replies[Math.min(bodies.length, replies.length) - 1]
    if (bodies.length === 1) {
      await firstGate
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: ndjson(events),
    })
  })
  return { bodies, releaseFirst }
}

async function createJazzMix(page: Page) {
  await page.goto('/app/mix')
  await page
    .getByRole('group', { name: 'Artists or genres' })
    .getByText('Genres', { exact: true })
    .click()
  await page.getByRole('button', { name: /Jazz/ }).click()
  await page.getByRole('button', { name: 'Create playlist' }).click()
}

const customJazzMixBody = {
  kind: 'genre_mix',
  genreIds: ['jazz'],
  tracksPerSeed: 50,
  orderMode: 'artist',
  persistToLibrary: true,
}

async function createCustomJazzMix(page: Page) {
  await page.goto('/app/mix')
  await page
    .getByRole('group', { name: 'Artists or genres' })
    .getByText('Genres', { exact: true })
    .click()
  await page.getByRole('button', { name: /Jazz/ }).click()
  await page.getByRole('slider', { name: 'Songs per genre' }).focus()
  await page.keyboard.press('End')
  await page.getByText('Artist A–Z', { exact: true }).click()
  await page.getByRole('button', { name: 'Create playlist' }).click()
}

function mainMenuLink(page: Page, name: string) {
  return page
    .getByRole('navigation', { name: 'Main menu' })
    .first()
    .getByRole('link', { name })
}

test.describe('Spotify provider failures while creating a playlist', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page)
    await mockGenres(page)
    await mockEmptyLibrary(page)
  })

  test('explains an unconfirmed Discover creation without blaming the song or retrying it', async ({
    page,
  }) => {
    await page.route('**/api/tracks/search**', (route) =>
      route.fulfill({ json: { tracks: [seedTrack] } }),
    )
    const generation = scriptGeneration(page, '**/api/playlists/discover', [
      [
        {
          type: 'error',
          statusCode: 502,
          code: 'SPOTIFY_OUTCOME_UNKNOWN',
          message: 'Spotify did not confirm the result of this change.',
          details: {
            operation: 'createPlaylist',
            category: 'upstream_error',
            status: 502,
          },
        },
      ],
      [{ type: 'result', playlist: discoverPlaylist }],
    ])

    generation.releaseFirst()
    await page.goto('/app/discover')
    await page
      .getByRole('group', { name: 'Starting point' })
      .getByText('Song', { exact: true })
      .click()
    await page.getByRole('combobox').fill('beso')
    await page.getByRole('option', { name: /Un Beso en la Nariz/ }).click()
    await page.getByRole('button', { name: 'Create playlist' }).click()

    await expect(
      page.getByRole('heading', { name: 'Couldn’t confirm the playlist' }),
    ).toBeVisible()
    await expect(page.getByRole('alert')).toContainText(
      'Spotify didn’t confirm whether the playlist was created',
    )
    await expect(page.getByText(/another artist or song/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
    expect(generation.bodies).toHaveLength(1)

    await expect(page.getByText('Un Beso en la Nariz').first()).toBeVisible()
    const submit = page.getByRole('button', { name: 'Create playlist' })
    await expect(submit).toBeDisabled()
    await expect(
      page.getByText('Check Spotify first. To create another playlist, use “Create a new playlist anyway” above.'),
    ).toBeVisible()
    await page.getByRole('radio', { name: 'Random' }).focus()
    await page.keyboard.press('Enter')
    await page.locator('form').first().evaluate((form: HTMLFormElement) => form.requestSubmit())
    await page.waitForTimeout(300)
    expect(generation.bodies).toHaveLength(1)

    const createNew = page.getByRole('button', { name: 'Create a new playlist anyway' })
    await createNew.focus()
    await page.keyboard.press('Enter')

    await expect(
      page.getByRole('heading', { name: 'Blendify · Discover · Un Beso en la Nariz' }),
    ).toBeVisible()
    expect(generation.bodies).toHaveLength(2)
    expect(generation.bodies[1]).toEqual(generation.bodies[0])
    expect(generation.bodies[0]).toMatchObject({
      kind: 'discover_track',
      trackId: seedTrack.id,
      targetTrackCount: 10,
    })
  })

  test('creates an unconfirmed Mix again after navigating only through the explicit action, with the original settings', async ({
    page,
  }) => {
    const generation = scriptGeneration(page, '**/api/playlists/mix', [
      [
        {
          type: 'error',
          statusCode: 502,
          code: 'SPOTIFY_OUTCOME_UNKNOWN',
          message: 'Spotify did not confirm the result of this change.',
          details: { operation: 'createPlaylist', category: 'timeout', status: null },
        },
      ],
      [{ type: 'result', playlist: spotifyJazzPlaylist }],
    ])

    await createCustomJazzMix(page)
    await expect(page.getByText('Creating your playlist')).toBeVisible()
    await expect.poll(() => generation.bodies.length).toBe(1)
    await mainMenuLink(page, 'Library').click()
    await expect(page.getByRole('heading', { name: 'Your Library' })).toBeVisible()
    generation.releaseFirst()

    const status = page.getByRole('region', { name: 'Playlist creation' })
    await expect(status.getByText('Couldn’t confirm your Mix')).toBeVisible()
    await status.getByRole('link', { name: 'View details' }).click()
    await expect(
      page.getByRole('heading', { name: 'Couldn’t confirm the playlist' }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Create playlist' })).toBeDisabled()
    expect(generation.bodies).toHaveLength(1)

    await page.getByRole('button', { name: 'Create a new playlist anyway' }).click()
    await expect(page.getByRole('heading', { name: 'Blendify · Mix · Jazz' })).toBeVisible()
    expect(generation.bodies).toHaveLength(2)
    expect(generation.bodies[1]).toEqual(generation.bodies[0])
    expect(generation.bodies[0]).toMatchObject(customJazzMixBody)
  })

  test('guards a lost connection after the write the same way, including after navigating back', async ({
    page,
  }) => {
    const generation = scriptGeneration(page, '**/api/playlists/mix', [
      [{ type: 'progress', phase: 'publishing', current: 1, total: 1, percent: 95 }],
      [{ type: 'result', playlist: spotifyJazzPlaylist }],
    ])

    await createCustomJazzMix(page)
    await expect(page.getByText('Creating your playlist')).toBeVisible()
    await expect.poll(() => generation.bodies.length).toBe(1)
    await mainMenuLink(page, 'Library').click()
    await expect(page.getByRole('heading', { name: 'Your Library' })).toBeVisible()
    generation.releaseFirst()

    const status = page.getByRole('region', { name: 'Playlist creation' })
    await expect(status.getByText('Lost connection while creating your Mix')).toBeVisible()
    await status.getByRole('link', { name: 'View details' }).click()
    await expect(page.getByRole('heading', { name: 'Lost connection' })).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('The playlist may already exist')
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)

    const submit = page.getByRole('button', { name: 'Create playlist' })
    await expect(submit).toBeDisabled()
    await page
      .getByRole('group', { name: 'Artists or genres' })
      .getByText('Genres', { exact: true })
      .click()
    await page.getByRole('button', { name: /Jazz/ }).first().click()
    await expect(submit).toBeDisabled()
    await page.getByRole('radio', { name: 'Random' }).focus()
    await page.keyboard.press('Enter')
    await page.locator('form').first().evaluate((form: HTMLFormElement) => form.requestSubmit())
    await page.waitForTimeout(300)
    expect(generation.bodies).toHaveLength(1)

    await page.getByRole('button', { name: 'Create a new playlist anyway' }).click()
    await expect(page.getByRole('heading', { name: 'Blendify · Mix · Jazz' })).toBeVisible()
    expect(generation.bodies).toHaveLength(2)
    expect(generation.bodies[1]).toEqual(generation.bodies[0])
    expect(generation.bodies[0]).toMatchObject(customJazzMixBody)
  })

  test('guards a connection reset after the request was sent', async ({ page }) => {
    const bodies: unknown[] = []
    await page.route('**/api/playlists/mix', async (route) => {
      bodies.push(route.request().postDataJSON())
      if (bodies.length === 1) {
        await route.abort('connectionreset')
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body: `${JSON.stringify({ type: 'result', playlist: spotifyJazzPlaylist })}\n`,
      })
    })

    await createJazzMix(page)
    await expect(page.getByRole('heading', { name: 'Lost connection' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create playlist' })).toBeDisabled()
    await page.locator('form').first().evaluate((form: HTMLFormElement) => form.requestSubmit())
    await page.waitForTimeout(300)
    expect(bodies).toHaveLength(1)

    await page.getByRole('button', { name: 'Create a new playlist anyway' }).click()
    await expect(page.getByRole('heading', { name: 'Blendify · Mix · Jazz' })).toBeVisible()
    expect(bodies).toHaveLength(2)
  })

  test('keeps a retryable provider failure recoverable after navigating away', async ({
    page,
  }) => {
    const generation = scriptGeneration(page, '**/api/playlists/mix', [
      [
        {
          type: 'error',
          statusCode: 503,
          code: 'SPOTIFY_UNAVAILABLE',
          message: 'Blendify could not communicate properly with Spotify.',
          details: {
            operation: 'searchTracks',
            category: 'upstream_error',
            status: 502,
          },
        },
      ],
      [{ type: 'result', playlist: spotifyJazzPlaylist }],
    ])

    await createCustomJazzMix(page)
    await expect(page.getByText('Creating your playlist')).toBeVisible()
    await expect.poll(() => generation.bodies.length).toBe(1)
    await mainMenuLink(page, 'Library').click()
    await expect(page.getByRole('heading', { name: 'Your Library' })).toBeVisible()
    generation.releaseFirst()

    const status = page.getByRole('region', { name: 'Playlist creation' })
    await expect(status.getByText('Couldn’t create your Mix')).toBeVisible()
    await status.getByRole('link', { name: 'View details' }).click()
    await expect(page).toHaveURL(/\/app\/mix$/)
    await expect(page.getByRole('alert')).toContainText(
      'Blendify couldn’t communicate properly with Spotify. Try again.',
    )

    await expect(page.getByRole('slider', { name: 'Songs per artist' })).toHaveValue('10')
    await expect(page.getByRole('radio', { name: 'Random' })).toBeChecked()

    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(
      page.getByRole('heading', { name: 'Blendify · Mix · Jazz' }),
    ).toBeVisible()
    expect(generation.bodies).toHaveLength(2)
    expect(generation.bodies[1]).toEqual(generation.bodies[0])
    expect(generation.bodies[0]).toMatchObject(customJazzMixBody)
  })

  test('links to a created playlist that could not be finished and never recreates it', async ({
    page,
  }) => {
    const generation = scriptGeneration(page, '**/api/playlists/mix', [
      [
        {
          type: 'error',
          statusCode: 502,
          code: 'SPOTIFY_PLAYLIST_INCOMPLETE',
          message: 'The playlist was created on Spotify, but Blendify could not finish adding its songs.',
          details: {
            spotifyId: 'created-1',
            spotifyUrl: 'https://open.spotify.com/playlist/created-1',
            failedStep: 'add_tracks',
            tracksAdded: 'unknown',
          },
        },
      ],
    ])

    await createJazzMix(page)
    await expect(page.getByText('Creating your playlist')).toBeVisible()
    await expect.poll(() => generation.bodies.length).toBe(1)
    await mainMenuLink(page, 'Library').click()
    await expect(page.getByRole('heading', { name: 'Your Library' })).toBeVisible()
    generation.releaseFirst()

    const status = page.getByRole('region', { name: 'Playlist creation' })
    await expect(status.getByText('Your Mix wasn’t finished')).toBeVisible()
    await status.getByRole('link', { name: 'View details' }).click()

    await expect(
      page.getByRole('heading', { name: 'Couldn’t finish the playlist' }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open in Spotify' })).toHaveAttribute(
      'href',
      'https://open.spotify.com/playlist/created-1',
    )
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
    expect(generation.bodies).toHaveLength(1)
  })

  test('shows a cover upload failure next to a completed playlist', async ({ page }) => {
    const generation = scriptGeneration(page, '**/api/playlists/mix', [
      [{ type: 'result', playlist: { ...spotifyJazzPlaylist, coverUploadFailed: true } }],
    ])
    generation.releaseFirst()

    await createJazzMix(page)
    await expect(
      page.getByRole('heading', { name: 'Blendify · Mix · Jazz' }),
    ).toBeVisible()
    await expect(page.getByText('Couldn’t add the cover.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open in Spotify' })).toBeVisible()
    expect(generation.bodies).toHaveLength(1)
  })
})
