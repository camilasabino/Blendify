import { describe, expect, it } from 'vitest'
import { messages, type Locale } from './messages'

const VARIABLE_PATTERN = /\{([^}]+)\}/g

function variables(template: string): string[] {
  return [...template.matchAll(VARIABLE_PATTERN)]
    .map((match) => match[1])
    .sort()
}

describe('localized messages', () => {
  it('keeps the same interpolation variables in every locale', () => {
    const locales: Locale[] = ['es', 'pt']

    for (const key of Object.keys(messages.en) as (keyof typeof messages.en)[]) {
      const expected = variables(messages.en[key])
      for (const locale of locales) {
        expect(variables(messages[locale][key]), `${locale}.${key}`).toEqual(
          expected,
        )
      }
    }
  })
})
