import { spotifyJazzPlaylist } from '@/test/playlist-fixtures'
import {
  usePlaylistRunStore,
  type PlaylistRunSpec,
} from '@/stores/playlist-run-store'

const spec: PlaylistRunSpec = {
  feature: 'mix',
  mode: 'spotify',
  request: {
    kind: 'genre_mix',
    name: 'Jazz',
    description: '',
    genreIds: ['jazz'],
    popularity: 'balanced',
    tracksPerSeed: 1,
    orderMode: 'random',
  },
  publication: { persistToLibrary: true },
  coverFailed: false,
}

const discoverSpec: PlaylistRunSpec = {
  feature: 'discover',
  mode: 'spotify',
  request: {
    kind: 'discover_artist',
    artistId: 'artist-1',
    artist: { id: 'artist-1', name: 'Sade', imageUrl: null },
    description: '',
    targetTrackCount: 30,
    popularity: 'balanced',
    orderMode: 'random',
  },
  publication: { persistToLibrary: true },
  coverFailed: false,
}

const outcome = { mode: 'spotify', playlist: spotifyJazzPlaylist } as const
const progress = {
  phase: 'matching_tracks',
  current: 1,
  total: 2,
  percent: 50,
} as const

function store() {
  return usePlaylistRunStore.getState()
}

afterEach(() => {
  store().discard()
})

describe('playlist run store', () => {
  it('starts an active run with no progress and hands out a live signal', () => {
    const started = store().begin(spec)

    expect(started).not.toBeNull()
    expect(started?.signal.aborted).toBe(false)
    expect(store().run).toMatchObject({
      id: started?.id,
      spec,
      status: { phase: 'active', progress: null },
    })
  })

  it('refuses a second run while one is active and leaves it untouched', () => {
    const first = store().begin(spec)
    const second = store().begin(discoverSpec)

    expect(second).toBeNull()
    expect(first?.signal.aborted).toBe(false)
    expect(store().run?.spec.feature).toBe('mix')
  })

  it('records progress only for the active run', () => {
    const { id } = store().begin(spec)!

    store().reportProgress(id, progress)
    expect(store().run?.status).toEqual({ phase: 'active', progress })

    store().reportProgress(id + 1, { ...progress, percent: 99 })
    expect(store().run?.status).toEqual({ phase: 'active', progress })
  })

  it('succeeds exactly once and rejects a duplicate terminal event', () => {
    const { id } = store().begin(spec)!

    expect(store().succeed(id, outcome)).toBe(true)
    expect(store().run).toMatchObject({
      status: { phase: 'succeeded', outcome },
      seen: false,
    })
    expect(store().succeed(id, outcome)).toBe(false)
    expect(store().fail(id, new Error('late'), false)).toBe(false)
    expect(store().run?.status.phase).toBe('succeeded')
  })

  it('distinguishes a failed run from one whose outcome is uncertain', () => {
    const failed = store().begin(spec)!
    store().fail(failed.id, new Error('boom'), false)
    expect(store().run?.status.phase).toBe('failed')

    const uncertain = store().begin(spec)!
    store().fail(uncertain.id, new TypeError('network'), true)
    expect(store().run?.status.phase).toBe('uncertain')
  })

  it('allows a new run once the previous one reached a terminal state', () => {
    const first = store().begin(spec)!
    store().succeed(first.id, outcome)

    const second = store().begin(spec)

    expect(second?.id).toBeGreaterThan(first.id)
    expect(store().run?.status.phase).toBe('active')
  })

  it('ignores results of a run that was replaced or discarded', () => {
    const first = store().begin(spec)!
    store().discard()
    const second = store().begin(spec)!

    expect(first.signal.aborted).toBe(true)
    expect(store().succeed(first.id, outcome)).toBe(false)
    expect(store().fail(first.id, new Error('late'), false)).toBe(false)
    expect(store().run).toMatchObject({
      id: second.id,
      status: { phase: 'active' },
    })
  })

  it('discard aborts the request and clears the run', () => {
    const { signal } = store().begin(spec)!

    store().discard()

    expect(signal.aborted).toBe(true)
    expect(store().run).toBeNull()
    expect(store().controller).toBeNull()
  })

  it('marks a terminal run as seen and re-arms it on the next transition', () => {
    const { id } = store().begin(spec)!
    store().succeed(id, outcome)

    store().markSeen(id)
    expect(store().run?.seen).toBe(true)

    store().markSeen(id + 1)
    expect(store().run?.seen).toBe(true)
  })
})
