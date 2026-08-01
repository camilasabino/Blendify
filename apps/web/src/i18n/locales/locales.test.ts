import { describe, expect, it } from 'vitest'
import { en } from './en'
import { es } from './es'
import { pt } from './pt'

function placeholders(message: string): string[] {
  return [...message.matchAll(/\{([^}]+)\}/g)]
    .map((match) => match[1])
    .sort()
}

describe('locale contracts', () => {
  it('keeps the same keys in every locale', () => {
    const englishKeys = Object.keys(en).sort()

    expect(Object.keys(es).sort()).toEqual(englishKeys)
    expect(Object.keys(pt).sort()).toEqual(englishKeys)
  })

  it('keeps interpolation variables aligned across locales', () => {
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      const expected = placeholders(en[key])

      expect(placeholders(es[key]), key).toEqual(expected)
      expect(placeholders(pt[key]), key).toEqual(expected)
    }
  })
})
