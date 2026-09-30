import { describe, expect, it } from 'vitest'
import { en } from './en'
import { es } from './es'
import { pt } from './pt'

function placeholders(message: string): string[] {
  return [...message.matchAll(/\{([^}]+)\}/g)]
    .map((match) => match[1])
    .sort()
}

const SPOTIFY_ACCESS_KEYS = [
  'authError.restricted',
  'authError.denied',
  'authError.failed',
  'authError.expired',
  'authError.moreInfo',
  'landing.spotifyAccess',
  'spotifyAccess.title',
  'spotifyAccess.intro',
  'spotifyAccess.whyTitle',
  'spotifyAccess.whyBody',
  'spotifyAccess.retry',
  'spotifyAccess.optionsTitle',
  'spotifyAccess.withoutTitle',
  'spotifyAccess.withoutBody',
  'spotifyAccess.withTitle',
  'spotifyAccess.withBody',
  'spotifyAccess.otherAccount',
  'spotifyAccess.continue',
] as const satisfies ReadonlyArray<keyof typeof en>

const ARTIFICIAL_ACCESS_COPY = [
  /funciones conectadas/i,
  /acceso conectado/i,
  /spotify-connected/i,
  /recursos conectados/i,
  /acesso conectado/i,
]

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

  it('explains Spotify access in concrete language', () => {
    const locales = [en, es, pt]

    for (const key of SPOTIFY_ACCESS_KEYS) {
      for (const locale of locales) {
        for (const pattern of ARTIFICIAL_ACCESS_COPY) {
          expect(locale[key], key).not.toMatch(pattern)
        }
      }
      expect(en[key].trim().length, key).toBeGreaterThan(0)
      expect(es[key].trim().length, key).toBeGreaterThan(0)
      expect(pt[key].trim().length, key).toBeGreaterThan(0)
    }

    expect(es['authError.restricted']).not.toMatch(/podés|probá|tenés|empezalo/i)
    expect(es['authError.denied']).not.toMatch(/podés|probá/i)
    expect(es['authError.failed']).not.toMatch(/probá/i)
    expect(es['authError.expired']).not.toMatch(/empezalo/i)
    expect(en['spotifyAccess.whyBody']).not.toMatch(/\d/)
    expect(es['spotifyAccess.whyBody']).not.toMatch(/\d/)
    expect(pt['spotifyAccess.whyBody']).not.toMatch(/\d/)
    expect(en['spotifyAccess.otherAccount']).not.toMatch(/request access|invitation/i)
    expect(es['spotifyAccess.otherAccount']).not.toMatch(/solicitud|invitación/i)
    expect(pt['spotifyAccess.otherAccount']).not.toMatch(/solicit|convite/i)
  })
})
