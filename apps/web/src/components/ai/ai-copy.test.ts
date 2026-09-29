import { AI_CLARIFICATION_REASONS, type AiClarification } from '@blendify/contracts'
import { LOCALES, messages, type Locale, type MessageKey } from '@/i18n/messages'
import { ApiError } from '@/lib/api-error'
import { aiErrorMessage, canRetryAiRequest, clarificationMessage } from './ai-copy'

function apiError(status: number, code: string) {
  return new ApiError(code, status, { statusCode: status, code, message: 'Raw server message' })
}

function translator(locale: Locale) {
  return (key: MessageKey, vars?: Record<string, string | number>) =>
    messages[locale][key].replaceAll(/\{(\w+)\}/g, (match, name: string) =>
      vars?.[name] === undefined ? match : String(vars[name]),
    )
}

function clarification(reason: AiClarification['reason']): AiClarification {
  return {
    reason,
    seedType: 'genre',
    limit: 5,
    names: ['acoustic'],
    unsupportedConstraints: [],
    options: [],
  }
}

describe.each(LOCALES)('Create with AI clarification copy (%s)', (locale) => {
  const t = translator(locale)

  it.each(AI_CLARIFICATION_REASONS)('renders readable fixed copy for %s', (reason) => {
    const text = clarificationMessage(clarification(reason), t)

    expect(text.length).toBeGreaterThan(0)
    expect(text).not.toContain('{')
    expect(text).not.toContain(reason)
  })

  it('names a genre that is too broad without exposing resolver details', () => {
    const text = clarificationMessage(clarification('ambiguous_genres'), t)

    expect(text).toContain('acoustic')
    expect(text).not.toMatch(/score|candidate|family|resolver/i)
    expect(text).not.toBe(clarificationMessage(clarification('unknown_genres'), t))
  })

  it('offers mixing artists only when that option is rendered', () => {
    const base = {
      ...clarification('too_many_seeds'),
      seedType: 'artist' as const,
      limit: 1,
      names: ['Radiohead', 'Interpol'],
    }

    expect(
      clarificationMessage(
        { ...base, options: [{ id: 'set_kind:artist_mix', type: 'set_kind', kind: 'artist_mix' }] },
        t,
      ),
    ).toBe(t('ai.clarify.singleArtist'))
    expect(clarificationMessage(base, t)).toBe(t('ai.clarify.singleArtistOnly'))
  })

  it.each([
    [503, 'AI_UNAVAILABLE'],
    [504, 'AI_TIMEOUT'],
    [502, 'AI_INVALID_OUTPUT'],
    [429, 'AI_RATE_LIMITED'],
    [429, 'RATE_LIMITED'],
  ])('maps retryable %s %s to fixed copy without the server message', (status, code) => {
    const error = apiError(status, code)

    expect(canRetryAiRequest(error)).toBe(true)
    expect(aiErrorMessage(error, t)).not.toContain('Raw server message')
    expect(aiErrorMessage(error, t)).not.toMatch(/\d{3}|model|OpenAI|bucket|interpret/i)
  })

  it('treats network failures as retryable', () => {
    expect(canRetryAiRequest(new TypeError('Failed to fetch'))).toBe(true)
    expect(aiErrorMessage(new TypeError('Failed to fetch'), t)).toBe(t('ai.error.generic'))
  })

  it.each([
    [400, 'AI_REQUEST_REJECTED', 'ai.error.requestRejected'],
    [404, 'AI_SESSION_NOT_FOUND', 'ai.error.sessionExpired'],
    [409, 'AI_CLARIFICATION_OPTION_UNAVAILABLE', 'ai.error.optionUnavailable'],
  ] as const)('does not offer Retry for %s %s', (status, code, key) => {
    const error = apiError(status, code)

    expect(canRetryAiRequest(error)).toBe(false)
    expect(aiErrorMessage(error, t)).toBe(t(key))
  })

  it('does not blame the request when the interpretation output was invalid', () => {
    expect(aiErrorMessage(apiError(502, 'AI_INVALID_OUTPUT'), t)).not.toBe(
      aiErrorMessage(apiError(400, 'AI_REQUEST_REJECTED'), t),
    )
  })

  it('falls back to generic copy for an unknown server error', () => {
    const error = apiError(500, 'INTERNAL_ERROR')

    expect(aiErrorMessage(error, t)).toBe(t('ai.error.generic'))
    expect(canRetryAiRequest(error)).toBe(true)
  })
})
