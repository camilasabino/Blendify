import { describe, expect, it } from 'vitest'
import { buildDefaultPlaylistName } from './playlist-name'

describe('buildDefaultPlaylistName', () => {
  it('names a single artist with Blendify brand + mix', () => {
    expect(
      buildDefaultPlaylistName({
        mode: 'artists',
        names: ['Radiohead'],
        mixMode: 'balanced',
      }),
    ).toBe('Blendify · Radiohead · Balanced')
  })

  it('summarizes many artists', () => {
    expect(
      buildDefaultPlaylistName({
        mode: 'artists',
        names: ['A', 'B', 'C', 'D'],
        mixMode: 'mood_chill',
        mixLabel: 'Chill',
      }),
    ).toBe('Blendify · A + 3 · Chill')
  })

  it('names genres the same way', () => {
    expect(
      buildDefaultPlaylistName({
        mode: 'genres',
        names: ['Jazz', 'Acid Jazz'],
        mixMode: 'popular',
        mixLabel: 'Popular',
      }),
    ).toBe('Blendify · Jazz + Acid Jazz · Popular')
  })
})
