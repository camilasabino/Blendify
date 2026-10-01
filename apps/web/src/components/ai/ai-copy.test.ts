import { AI_CLARIFICATION_REASONS, type AiClarification } from '@blendify/contracts'
import { LOCALES, messages, type Locale, type MessageKey } from '@/i18n/messages'
import { ApiError } from '@/lib/api-error'
import {
  aiErrorMessage,
  aiRateLimitMessage,
  canRetryAiRequest,
  clarificationMessage,
  isAiRateLimited,
} from './ai-copy'

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

  it('names a region incompatible with an artist mix by its localized label', () => {
    const text = clarificationMessage(
      { ...clarification('region_not_supported'), seedType: null, names: ['brazilian'] },
      t,
    )

    expect(text).toContain(messages[locale]['region.brazilian'])
    expect(text).not.toContain('brazilian')
  })

  it('explains why female vocals cannot refine the artists of an artist mix', () => {
    const text = clarificationMessage(
      { ...clarification('female_vocals_not_supported'), seedType: null, names: [] },
      t,
    )

    expect(text).toBe(messages[locale]['ai.clarify.femaleVocalsNotSupported'])
    expect(text.toLowerCase()).not.toContain('women')
  })

  it('asks again for a period that ends before it starts', () => {
    expect(
      clarificationMessage(
        { ...clarification('invalid_release_range'), seedType: null, names: ['1999–1990'] },
        t,
      ),
    ).toContain('1999–1990')
  })

  it('quotes a region outside the curated list as the user wrote it', () => {
    const text = clarificationMessage(
      { ...clarification('unknown_region'), seedType: null, names: ['japonés'] },
      t,
    )

    expect(text).toContain('japonés')
  })

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

describe('Create with AI temporary limit copy', () => {
  const t = translator('en')

  function rateLimited(details?: Record<string, unknown>) {
    return new ApiError('RATE_LIMITED', 429, {
      statusCode: 429,
      code: 'RATE_LIMITED',
      message: 'Raw server message',
      details,
    })
  }

  it.each([
    [291, 'You’ve reached the temporary Create with AI limit. You can try again in about 5 minutes.'],
    [45, 'You’ve reached the temporary Create with AI limit. You can try again in about 45 seconds.'],
    [0, 'You’ve reached the temporary Create with AI limit. Try again in a few minutes.'],
    ['soon', 'You’ve reached the temporary Create with AI limit. Try again in a few minutes.'],
  ])('describes a retryAfterSeconds of %s', (retryAfterSeconds, message) => {
    expect(aiRateLimitMessage(rateLimited({ retryAfterSeconds }), t)).toBe(message)
  })

  it('recognizes only Blendify request limits', () => {
    expect(isAiRateLimited(rateLimited())).toBe(true)
    expect(isAiRateLimited(apiError(429, 'AI_RATE_LIMITED'))).toBe(false)
    expect(isAiRateLimited(apiError(429, 'SPOTIFY_RATE_LIMITED'))).toBe(false)
    expect(isAiRateLimited(apiError(503, 'CAPACITY_EXCEEDED'))).toBe(false)
  })

  it('keeps the generic request-limit copy outside interpretation and refinement', () => {
    expect(aiErrorMessage(rateLimited({ retryAfterSeconds: 30 }), t)).toBe(
      'Too many requests. Try again in about 30 seconds.',
    )
  })
})
