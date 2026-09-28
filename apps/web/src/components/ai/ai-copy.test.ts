import { AI_CLARIFICATION_REASONS, type AiClarification } from '@blendify/contracts'
import { LOCALES, messages, type Locale, type MessageKey } from '@/i18n/messages'
import { clarificationMessage } from './ai-copy'

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
})
