import { QueryClient } from '@tanstack/react-query'
import {
  rerunPlaylistRun,
  startPlaylistRun,
} from '@/lib/playlist-run-coordinator'
import {
  usePlaylistRunStore,
  type PlaylistRunSpec,
} from '@/stores/playlist-run-store'
import {
  jsonResponse,
  pendingNdjsonResponse,
  stubApi,
  type PendingNdjsonStream,
} from '@/test/app-harness'
import { guestJazzPlaylist, spotifyJazzPlaylist } from '@/test/playlist-fixtures'

const request: PlaylistRunSpec['request'] = {
  kind: 'genre_mix',
  name: 'Jazz',
  description: '',
  genreIds: ['jazz'],
  popularity: 'balanced',
  tracksPerSeed: 1,
  orderMode: 'random',
}

const spotifySpec: PlaylistRunSpec = {
  feature: 'mix',
  mode: 'spotify',
  request,
  publication: { persistToLibrary: true },
  coverFailed: false,
}

const guestSpec: PlaylistRunSpec = { ...spotifySpec, mode: 'guest' }

function phase() {
  return usePlaylistRunStore.getState().run?.status.phase
}

function pendingRoute(streams: PendingNdjsonStream[]) {
  return (_call: unknown, signal?: AbortSignal) => {
    const stream = pendingNdjsonResponse(signal)
    streams.push(stream)
    return stream.response
  }
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

afterEach(() => {
  usePlaylistRunStore.getState().discard()
  vi.unstubAllGlobals()
})

describe('playlist run coordinator', () => {
  it('runs a Spotify run to success and invalidates Library and Stats exactly once', async () => {
    const streams: PendingNdjsonStream[] = []
    stubApi({ 'POST /api/playlists/mix': pendingRoute(streams) })
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    expect(startPlaylistRun(spotifySpec, queryClient)).toBe(true)
    streams[0].push({
      type: 'progress',
      phase: 'publishing',
      current: 1,
      total: 1,
      percent: 95,
    })
    await settle()
    expect(usePlaylistRunStore.getState().run?.status).toMatchObject({
      phase: 'active',
      progress: { percent: 95 },
    })

    streams[0].push({ type: 'result', playlist: spotifyJazzPlaylist })
    streams[0].close()
    await settle()

    expect(phase()).toBe('succeeded')
    expect(invalidate.mock.calls).toEqual([
      [{ queryKey: ['usage-stats'] }],
      [{ queryKey: ['playlists'] }],
    ])
  })

  it('does not invalidate queries for a Guest result', async () => {
    const streams: PendingNdjsonStream[] = []
    stubApi({ 'POST /api/generate/mix': pendingRoute(streams) })
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    startPlaylistRun(guestSpec, queryClient)
    streams[0].push({ type: 'result', playlist: guestJazzPlaylist })
    streams[0].close()
    await settle()

    expect(phase()).toBe('succeeded')
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('refuses to start while a run is active without issuing a second request', async () => {
    const streams: PendingNdjsonStream[] = []
    const { calls } = stubApi({ 'POST /api/playlists/mix': pendingRoute(streams) })
    const queryClient = new QueryClient()

    expect(startPlaylistRun(spotifySpec, queryClient)).toBe(true)
    expect(startPlaylistRun(spotifySpec, queryClient)).toBe(false)
    await settle()

    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1)
  })

  it('aborts the request and skips every side effect after a discard', async () => {
    const streams: PendingNdjsonStream[] = []
    stubApi({ 'POST /api/playlists/mix': pendingRoute(streams) })
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    startPlaylistRun(spotifySpec, queryClient)
    usePlaylistRunStore.getState().discard()
    await settle()

    expect(streams[0].signal?.aborted).toBe(true)
    expect(usePlaylistRunStore.getState().run).toBeNull()
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('marks a typed backend error as failed and lets the same request run again', async () => {
    const streams: PendingNdjsonStream[] = []
    const { calls } = stubApi({ 'POST /api/playlists/mix': pendingRoute(streams) })
    const queryClient = new QueryClient()

    startPlaylistRun(spotifySpec, queryClient)
    streams[0].push({
      type: 'error',
      statusCode: 502,
      code: 'CATALOG_UNAVAILABLE',
      message: 'Catalog unavailable',
    })
    streams[0].close()
    await settle()
    expect(phase()).toBe('failed')

    expect(rerunPlaylistRun(queryClient)).toBe(true)
    await settle()

    const posts = calls.filter((call) => call.method === 'POST')
    expect(posts).toHaveLength(2)
    expect(posts[1].body).toEqual(posts[0].body)
    expect(phase()).toBe('active')
  })

  it.each([
    ['a dropped connection', () => Promise.reject(new TypeError('network error'))],
    [
      'a stream that ends without a result',
      () => Promise.resolve(new Response('', { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } })),
    ],
  ])('treats %s as an uncertain Spotify outcome and never offers a rerun', async (_label, respond) => {
    stubApi({ 'POST /api/playlists/mix': respond })
    const queryClient = new QueryClient()

    startPlaylistRun(spotifySpec, queryClient)
    await settle()

    expect(phase()).toBe('uncertain')
    expect(rerunPlaylistRun(queryClient)).toBe(false)
  })

  it('treats the same interruption as an ordinary failure for a Guest run', async () => {
    stubApi({
      'POST /api/generate/mix': () => Promise.reject(new TypeError('network error')),
    })

    startPlaylistRun(guestSpec, new QueryClient())
    await settle()

    expect(phase()).toBe('failed')
  })

  it('keeps an HTTP error response a plain failure even in Spotify Mode', async () => {
    stubApi({
      'POST /api/playlists/mix': () =>
        jsonResponse({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'nope' }, 500),
    })

    startPlaylistRun(spotifySpec, new QueryClient())
    await settle()

    expect(phase()).toBe('failed')
  })
})
