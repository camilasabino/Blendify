import {
  clearAppReturnTarget,
  consumeAppReturnTarget,
  markAppReturnTarget,
} from './app-return-target'

const STORAGE_KEY = 'blendify.appReturnTo'

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('app return target', () => {
  it.each(['/app/mix', '/app/discover', '/app/ai'])(
    'remembers %s and gives it back once',
    (path) => {
      markAppReturnTarget(path, 1_000)

      expect(consumeAppReturnTarget(2_000)).toBe(path)
      expect(consumeAppReturnTarget(2_000)).toBeNull()
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
    },
  )

  it.each([
    'https://evil.example/app/mix',
    '//evil.example/app/mix',
    '/app/mix?next=/app/stats',
    '/app/mix#fragment',
    '/app/mixer',
    'app/mix',
    '/app',
    '/',
    '',
  ])('refuses %s as a return target', (path) => {
    markAppReturnTarget(path)

    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(consumeAppReturnTarget()).toBeNull()
  })

  it.each(['/app/library', '/app/stats'])(
    'refuses the Spotify-only route %s',
    (path) => {
      markAppReturnTarget(path)

      expect(consumeAppReturnTarget()).toBeNull()
    },
  )

  it('drops a pending target when an unsupported path starts a new login', () => {
    markAppReturnTarget('/app/discover', 1_000)

    markAppReturnTarget('/', 1_100)

    expect(consumeAppReturnTarget(1_200)).toBeNull()
  })

  it('forgets a target once it is too old', () => {
    markAppReturnTarget('/app/mix', 0)

    expect(consumeAppReturnTarget(15 * 60_000 + 1)).toBeNull()
  })

  it('refuses a target marked in the future', () => {
    markAppReturnTarget('/app/mix', 5_000)

    expect(consumeAppReturnTarget(4_000)).toBeNull()
  })

  it.each([
    'not json',
    '"/app/mix"',
    '{"target":"/app/mix"}',
    '{"target":"/app/library","markedAt":1000}',
    '{"target":"/app/mix","markedAt":"1000"}',
  ])('ignores the malformed stored value %s', (raw) => {
    sessionStorage.setItem(STORAGE_KEY, raw)

    expect(consumeAppReturnTarget(1_100)).toBeNull()
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('refuses Create with AI while the feature is disabled', () => {
    vi.stubEnv('VITE_AI_CREATION_ENABLED', 'false')

    markAppReturnTarget('/app/ai', 1_000)
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()

    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ target: '/app/ai', markedAt: 1_000 }),
    )
    expect(consumeAppReturnTarget(1_100)).toBeNull()
  })

  it('can be cleared explicitly', () => {
    markAppReturnTarget('/app/ai', 1_000)

    clearAppReturnTarget()

    expect(consumeAppReturnTarget(1_100)).toBeNull()
  })

  it('tolerates unavailable storage', () => {
    const blocked = () => {
      throw new Error('blocked')
    }
    vi.stubGlobal('sessionStorage', {
      getItem: blocked,
      setItem: blocked,
      removeItem: blocked,
    })

    expect(() => markAppReturnTarget('/app/mix')).not.toThrow()
    expect(() => clearAppReturnTarget()).not.toThrow()
    expect(consumeAppReturnTarget()).toBeNull()
  })
})
