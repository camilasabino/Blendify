import { isAiCreationEnabled } from './ai-creation'

describe('isAiCreationEnabled', () => {
  it('defaults to on in development and off in production builds', () => {
    expect(isAiCreationEnabled({ DEV: true })).toBe(true)
    expect(isAiCreationEnabled({ DEV: false })).toBe(false)
  })

  it('follows an explicit flag in either mode', () => {
    expect(isAiCreationEnabled({ DEV: false, VITE_AI_CREATION_ENABLED: 'true' })).toBe(true)
    expect(isAiCreationEnabled({ DEV: true, VITE_AI_CREATION_ENABLED: 'false' })).toBe(false)
  })
})
