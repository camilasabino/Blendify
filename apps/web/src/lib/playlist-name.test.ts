import { describe, expect, it } from 'vitest'
import {
  buildDefaultPlaylistDescription,
  buildDefaultPlaylistName,
} from './playlist-name'

describe('buildDefaultPlaylistName', () => {
  it('names a single artist with Blendify · Mix', () => {
    expect(
      buildDefaultPlaylistName({
        names: ['Radiohead'],
      }),
    ).toBe('Blendify · Mix · Radiohead')
  })

  it('summarizes many artists after Mix', () => {
    expect(
      buildDefaultPlaylistName({
        names: ['A', 'B', 'C', 'D'],
      }),
    ).toBe('Blendify · Mix · A + 3')
  })

  it('names genres the same way', () => {
    expect(
      buildDefaultPlaylistName({
        names: ['Jazz', 'Acid Jazz'],
      }),
    ).toBe('Blendify · Mix · Jazz + Acid Jazz')
  })
})

describe('buildDefaultPlaylistDescription', () => {
  it('uses localized templates when provided', () => {
    const translate = (
      key:
        | 'playlist.description.empty'
        | 'playlist.description.one'
        | 'playlist.description.two'
        | 'playlist.description.many',
      vars?: Record<string, string | number>,
    ) => `${key}:${JSON.stringify(vars ?? {})}`

    expect(
      buildDefaultPlaylistDescription(['Sade', 'Prince', 'Björk'], translate),
    ).toBe(
      'playlist.description.many:{"first":"Sade","count":2}',
    )
  })

  it('keeps the English fallback for non-UI callers', () => {
    expect(buildDefaultPlaylistDescription(['Sade'])).toBe(
      'Made with Blendify from Sade.',
    )
  })
})
