import { describe, expect, it } from 'vitest'
import type { PlaylistSummary } from '@blendify/contracts'
import {
  libraryDisplayTitle,
  libraryKindKey,
} from './library-list-helpers'

const t = (key: string, vars?: Record<string, string | number>) =>
  `${key}:${JSON.stringify(vars ?? {})}`

function playlist(
  name: string,
  seedNames: string[],
  seedCount = seedNames.length,
): Pick<PlaylistSummary, 'name' | 'seeds' | 'seedCount'> {
  return {
    name,
    seedCount,
    seeds: seedNames.map((seedName, index) => ({
      type: 'artist' as const,
      id: `artist-${index}`,
      name: seedName,
    })),
  }
}

describe('libraryDisplayTitle', () => {
  it('uses the seed name for generated single-seed playlists', () => {
    expect(libraryDisplayTitle(playlist('Blendify · Mix · Guster', ['Guster']), t)).toBe(
      'Guster',
    )
  })

  it('joins two seeds', () => {
    expect(
      libraryDisplayTitle(
        playlist('Blendify · Mix · Guster + Dispatch', ['Guster', 'Dispatch']),
        t,
      ),
    ).toBe('Guster + Dispatch')
  })

  it('summarizes larger seed lists with the full seed count', () => {
    expect(
      libraryDisplayTitle(playlist('Blendify · Mix · A + 4', ['A', 'B', 'C'], 5), t),
    ).toBe('library.titleMany:{"first":"A","second":"B","count":3}')
  })

  it('keeps names the user renamed', () => {
    expect(libraryDisplayTitle(playlist('Road trip', ['Guster']), t)).toBe(
      'Road trip',
    )
  })

  it('falls back to the stored name without seeds', () => {
    expect(libraryDisplayTitle(playlist('Blendify · Mix', []), t)).toBe(
      'Blendify · Mix',
    )
  })
})

describe('libraryKindKey', () => {
  it('groups playlist kinds into Mix and Discover', () => {
    expect(libraryKindKey('artist_mix')).toBe('library.kindMix')
    expect(libraryKindKey('genre_mix')).toBe('library.kindMix')
    expect(libraryKindKey('discover_artist')).toBe('library.kindDiscover')
    expect(libraryKindKey('discover_track')).toBe('library.kindDiscover')
  })
})
