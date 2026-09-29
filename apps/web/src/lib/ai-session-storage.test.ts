import {
  clearStoredAiSession,
  consumeAiReturnAfterLogin,
  markAiReturnAfterLogin,
  readStoredAiSession,
  writeStoredAiSession,
} from './ai-session-storage'

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('ai session storage', () => {
  it('round-trips the stored session', () => {
    writeStoredAiSession({
      sessionId: 'session-id',
      accessKey: 'access-key',
      prompt: 'Music like Björk',
      playlistTitle: 'Run',
    })

    expect(readStoredAiSession()).toEqual({
      sessionId: 'session-id',
      accessKey: 'access-key',
      prompt: 'Music like Björk',
      playlistTitle: 'Run',
    })
    expect(sessionStorage.getItem('blendify.aiSession')).not.toBeNull()

    clearStoredAiSession()
    expect(readStoredAiSession()).toBeNull()
  })

  it('ignores malformed stored values', () => {
    sessionStorage.setItem('blendify.aiSession', '{"sessionId":42}')
    expect(readStoredAiSession()).toBeNull()

    sessionStorage.setItem('blendify.aiSession', 'not json')
    expect(readStoredAiSession()).toBeNull()
  })

  it('drops a stored session that predates the separate access key', () => {
    sessionStorage.setItem(
      'blendify.aiSession',
      JSON.stringify({ sessionId: 'legacy-token', prompt: 'Music like Björk', playlistTitle: null }),
    )

    expect(readStoredAiSession()).toBeNull()
  })

  it('tolerates unavailable storage', () => {
    const blocked = () => {
      throw new Error('blocked')
    }
    vi.stubGlobal('sessionStorage', { getItem: blocked, setItem: blocked, removeItem: blocked })

    expect(() => writeStoredAiSession({ sessionId: 'a', accessKey: 'k', prompt: 'b', playlistTitle: null })).not.toThrow()
    expect(readStoredAiSession()).toBeNull()
    expect(() => clearStoredAiSession()).not.toThrow()
    expect(() => markAiReturnAfterLogin()).not.toThrow()
    expect(consumeAiReturnAfterLogin()).toBe(false)
  })

  it('returns to Create with AI only once after a recent reconnect', () => {
    markAiReturnAfterLogin(1_000)

    expect(consumeAiReturnAfterLogin(61_000)).toBe(true)
    expect(consumeAiReturnAfterLogin(61_000)).toBe(false)
  })

  it('forgets an old or malformed reconnect intent', () => {
    markAiReturnAfterLogin(0)
    expect(consumeAiReturnAfterLogin(16 * 60_000)).toBe(false)
    expect(sessionStorage.getItem('blendify.aiReturnAfterLogin')).toBeNull()

    sessionStorage.setItem('blendify.aiReturnAfterLogin', 'soon')
    expect(consumeAiReturnAfterLogin()).toBe(false)
  })
})
