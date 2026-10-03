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
  'landing.accessNote',
  'landing.accessMore',
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
  'spotifyAccess.privatePlaylists',
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
    for (const [key, value] of Object.entries(es)) {
      expect(value, key).not.toMatch(/volvé|tenés|podés|hacé|probá|empezalo|semilla/i)
    }
    expect(en['spotifyAccess.whyBody']).not.toMatch(/\d/)
    expect(es['spotifyAccess.whyBody']).not.toMatch(/\d/)
    expect(pt['spotifyAccess.whyBody']).not.toMatch(/\d/)
    expect(en['spotifyAccess.otherAccount']).not.toMatch(/request access|invitation/i)
    expect(es['spotifyAccess.otherAccount']).not.toMatch(/solicitud|invitación/i)
    expect(pt['spotifyAccess.otherAccount']).not.toMatch(/solicit|convite/i)
  })

  it('offers four executable Create with AI examples in every locale', () => {
    const exampleKeys = [
      'ai.suggestion.artists',
      'ai.suggestion.genres',
      'ai.suggestion.discoverArtist',
      'ai.suggestion.discoverTrack',
    ] as const
    const retired = [
      '30 deep cuts from Radiohead and Interpol',
      '30 deep cuts from Radiohead and Interpol, no Coldplay',
      'Shoegaze and dream pop, around 40 songs',
      'Music similar to Björk',
      'Music similar to Björk, lesser-known, from the ’90s and 2000s',
      'Start from Teardrop by Massive Attack',
      '20 songs similar to Teardrop by Massive Attack, no live versions',
      'Argentine rock from the ’80s and ’90s, female vocals, no live versions',
      'For example: 30 deep cuts from Radiohead and Interpol, no Coldplay',
      'For example: 25 British indie rock tracks from 2000 to 2015, a mix of hits and deep cuts, in shuffled order',
      '30 canciones menos conocidas de Radiohead e Interpol',
      '30 canciones menos conocidas de Soda Stereo y Los Fabulosos Cadillacs, sin Maná',
      'Shoegaze y dream pop, unas 40 canciones',
      'Música parecida a Björk',
      'Música parecida a Björk, menos conocida, de los 90 y los 2000',
      'Empezar desde Teardrop de Massive Attack',
      '20 canciones parecidas a Teardrop de Massive Attack, sin versiones en vivo',
      'Rock argentino de los 80 y 90, voces femeninas, sin versiones en vivo',
      'Por ejemplo: 30 canciones menos conocidas de Soda Stereo y Los Fabulosos Cadillacs, nada de Maná',
      'Por ejemplo: 25 canciones de indie rock británico entre 2000 y 2015, mezcla de éxitos y temas menos conocidos, en orden aleatorio',
      '30 músicas menos conhecidas de Radiohead e Interpol',
      '30 músicas menos conhecidas de Caetano Veloso e Gilberto Gil, sem Roberto Carlos',
      'Shoegaze e dream pop, umas 40 músicas',
      'Músicas parecidas com Björk',
      'Músicas parecidas com Björk, menos conhecidas, dos anos 90 e dos anos 2000',
      'Começar por Teardrop, de Massive Attack',
      '20 músicas parecidas com Teardrop, do Massive Attack, sem versões ao vivo',
      'Rock argentino dos anos 80 e 90, vozes femininas, sem versões ao vivo',
      'Por exemplo: 30 músicas menos conhecidas de Caetano Veloso e Gilberto Gil, sem Roberto Carlos',
      'Por exemplo: 25 músicas de indie rock britânico entre 2000 e 2015, mistura de sucessos e músicas menos conhecidas, em ordem aleatória',
    ]
    const dropped = [
      /sin maná/i,
      /nada de maná/i,
      /no coldplay/i,
      /rock argentino/i,
      /argentine rock/i,
      /soda stereo/i,
      /roberto carlos/i,
    ]

    expect(en['ai.subtitle']).toBe(
      'Name artists, a song or genres, and add details like size, familiarity, era, region, or music to avoid. Blendify shows what it understood before building anything.',
    )
    expect(es['ai.subtitle']).toBe(
      'Nombra artistas, una canción o géneros, y agrega detalles como tamaño, familiaridad, época, región o música a evitar. Blendify te muestra lo que entendió antes de crear nada.',
    )
    expect(pt['ai.subtitle']).toBe(
      'Cite artistas, uma música ou gêneros e adicione detalhes como tamanho, familiaridade, época, região ou músicas a evitar. O Blendify mostra o que entendeu antes de criar qualquer coisa.',
    )

    expect(en['ai.promptPlaceholder']).toBe(
      'For example: 25 British indie rock tracks from 2000 to 2015, no Oasis, shuffled',
    )
    expect(es['ai.promptPlaceholder']).toBe(
      'Por ejemplo: 25 canciones de indie rock británico entre 2000 y 2015, sin Oasis, en orden aleatorio',
    )
    expect(pt['ai.promptPlaceholder']).toBe(
      'Por exemplo: 25 músicas de indie rock britânico entre 2000 e 2015, sem Oasis, em ordem aleatória',
    )

    expect(en['ai.suggestion.artists']).toBe(
      '30 tracks from Radiohead and Interpol, balancing hits and deeper cuts',
    )
    expect(en['ai.suggestion.genres']).toBe(
      'Pop from the 2000s and 2010s, female vocals, no live versions',
    )
    expect(en['ai.suggestion.discoverArtist']).toBe(
      "Music similar to Björk from the '90s and 2000s",
    )
    expect(en['ai.suggestion.discoverTrack']).toBe(
      '20 songs similar to Teardrop by Massive Attack',
    )

    expect(es['ai.suggestion.artists']).toBe(
      '30 canciones de Radiohead e Interpol, con una mezcla equilibrada de éxitos y temas menos obvios',
    )
    expect(es['ai.suggestion.genres']).toBe(
      'Pop de los 2000 y 2010, voces femeninas, sin versiones en vivo',
    )
    expect(es['ai.suggestion.discoverArtist']).toBe(
      'Música parecida a Björk, de los 90 y los 2000',
    )
    expect(es['ai.suggestion.discoverTrack']).toBe(
      '20 canciones parecidas a Teardrop de Massive Attack',
    )

    expect(pt['ai.suggestion.artists']).toBe(
      '30 músicas de Radiohead e Interpol, equilibrando sucessos e faixas menos óbvias',
    )
    expect(pt['ai.suggestion.genres']).toBe(
      'Pop dos anos 2000 e 2010, vozes femininas, sem versões ao vivo',
    )
    expect(pt['ai.suggestion.discoverArtist']).toBe(
      'Músicas parecidas com Björk, dos anos 90 e 2000',
    )
    expect(pt['ai.suggestion.discoverTrack']).toBe(
      '20 músicas parecidas com Teardrop, do Massive Attack',
    )

    expect(exampleKeys).toHaveLength(4)

    for (const locale of [en, es, pt]) {
      const examples = exampleKeys.map((key) => locale[key])
      const onboarding = [locale['ai.promptPlaceholder'], ...examples]

      expect(new Set(examples).size).toBe(exampleKeys.length)
      expect(examples).not.toContain(locale['ai.promptPlaceholder'])
      expect(locale['ai.promptPlaceholder']).toMatch(/Oasis/)
      expect(locale['ai.promptPlaceholder']).toMatch(/2000/)
      expect(locale['ai.promptPlaceholder']).toMatch(/2015/)
      expect(locale['ai.suggestion.artists']).toMatch(/Radiohead/)
      expect(locale['ai.suggestion.artists']).toMatch(/Interpol/)
      expect(locale['ai.suggestion.artists']).toMatch(/\b30\b/)
      expect(locale['ai.suggestion.genres']).toMatch(/^Pop\b/)
      expect(locale['ai.suggestion.genres']).toMatch(/2000/)
      expect(locale['ai.suggestion.genres']).toMatch(/2010/)
      expect(locale['ai.suggestion.discoverArtist']).toMatch(/Björk/)
      expect(locale['ai.suggestion.discoverArtist']).toMatch(/90/)
      expect(locale['ai.suggestion.discoverArtist']).toMatch(/2000/)
      expect(locale['ai.suggestion.discoverTrack']).toMatch(/Teardrop/)
      expect(locale['ai.suggestion.discoverTrack']).toMatch(/Massive Attack/)
      expect(locale['ai.suggestion.discoverTrack']).toMatch(/\b20\b/)
      expect(examples.join('\n')).not.toMatch(/Oasis|Maná|Coldplay|Roberto Carlos/)
      expect(locale['ai.suggestion.artists']).not.toMatch(/vivo|live|voces|vocals|vozes/i)
      expect(locale['ai.suggestion.genres']).not.toMatch(/Radiohead|Björk|Teardrop|Oasis/)
      expect(locale['ai.suggestion.discoverArtist']).not.toMatch(/\b20\b|\b30\b|vivo|live|voces|vocals|vozes/i)
      expect(locale['ai.suggestion.discoverTrack']).not.toMatch(/vivo|live|voces|vocals|vozes|Björk/i)

      for (const example of examples) {
        expect(example.trim().length).toBeGreaterThan(0)
        expect(example).not.toMatch(/artist mix|genre mix|discover|familiarity|familiaridad|familiaridade/i)
      }
      for (const previous of retired) {
        expect(onboarding).not.toContain(previous)
      }
      for (const pattern of dropped) {
        for (const line of onboarding) {
          expect(line).not.toMatch(pattern)
        }
      }
    }
  })

  it('names the existing playlist explicitly in the refinement review', () => {
    expect(en['ai.refine.review.subtitle']).toMatch(/keep your existing playlist\.$/)
    expect(es['ai.refine.review.subtitle']).toMatch(/conservar la playlist actual\.$/)
    expect(pt['ai.refine.review.subtitle']).toMatch(/manter a playlist atual\.$/)

    for (const locale of [en, es, pt]) {
      expect(locale['ai.refine.review.subtitle']).not.toMatch(/current one|previous|anterior|la actual\.|a atual\./i)
    }
  })
})
