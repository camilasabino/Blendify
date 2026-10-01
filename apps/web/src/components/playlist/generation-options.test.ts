import type { PlaylistGeneration } from '@blendify/contracts'
import { messages, type MessageKey } from '@/i18n/messages'
import { buildRecipeSummary, selectionFilterLabels } from './generation-options'

function translator(locale: 'en' | 'es') {
  return (key: MessageKey, vars?: Record<string, string | number>) =>
    messages[locale][key].replaceAll(/\{(\w+)\}/g, (match, name: string) =>
      vars?.[name] === undefined ? match : String(vars[name]),
    )
}

const INACTIVE = {
  region: null,
  femaleVocals: false,
  releaseRange: null,
  excludeLive: false,
}

describe('selection filter summaries', () => {
  it('lists only the active filters in their stable order', () => {
    const t = translator('es')

    expect(selectionFilterLabels(INACTIVE, t)).toEqual([])
    expect(
      selectionFilterLabels(
        {
          region: 'argentina',
          femaleVocals: true,
          releaseRange: { fromYear: 1990, toYear: 1999 },
          excludeLive: true,
        },
        t,
      ),
    ).toEqual(['Argentina', 'Voces femeninas', '1990–1999', 'Sin versiones en vivo'])
  })

  it('labels open-ended release ranges', () => {
    const t = translator('en')

    expect(
      selectionFilterLabels({ ...INACTIVE, releaseRange: { fromYear: 2015 } }, t),
    ).toEqual(['From 2015'])
    expect(
      selectionFilterLabels({ ...INACTIVE, releaseRange: { toYear: 1999 } }, t),
    ).toEqual(['Up to 1999'])
  })

  it('summarizes an artist mix recipe with its track filters', () => {
    const t = translator('en')
    const generation: PlaylistGeneration = {
      version: 1,
      kind: 'artist_mix',
      tracksPerSeed: 10,
      seeds: [{ id: 'soda', name: 'Soda Stereo' }],
      filters: {
        ...INACTIVE,
        releaseRange: { fromYear: 1980, toYear: 1989 },
        excludeLive: true,
      },
      popularity: 'balanced',
      orderMode: 'random',
    }

    expect(buildRecipeSummary(generation, 10, t, (genre) => genre.name)).toEqual([
      'Soda Stereo',
      '1980–1989',
      'No live versions',
      'Balanced',
      'Random',
      '10 songs',
    ])
  })
})
