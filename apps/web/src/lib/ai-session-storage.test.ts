import {
  clearStoredAiSession,
  readStoredAiSession,
  writeStoredAiSession,
} from './ai-session-storage'

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('ai session storage', () => {
  it('round-trips the stored session', () => {
    writeStoredAiSession({ sessionId: 'session-token', prompt: 'Music like Björk', playlistTitle: 'Run' })

    expect(readStoredAiSession()).toEqual({
      sessionId: 'session-token',
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

  it('tolerates unavailable storage', () => {
    const blocked = () => {
      throw new Error('blocked')
    }
    vi.stubGlobal('sessionStorage', { getItem: blocked, setItem: blocked, removeItem: blocked })

    expect(() => writeStoredAiSession({ sessionId: 'a', prompt: 'b', playlistTitle: null })).not.toThrow()
    expect(readStoredAiSession()).toBeNull()
    expect(() => clearStoredAiSession()).not.toThrow()
  })
})
