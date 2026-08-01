import { describe, expect, it } from 'vitest'
import {
  buildDefaultPlaylistDescription,
  buildDefaultPlaylistName,
  buildDiscoverPlaylistName,
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

  it('falls back when names are empty', () => {
    expect(buildDefaultPlaylistName({ names: ['  ', ''] })).toBe(
      'Blendify · Mix',
    )
  })
})

describe('buildDiscoverPlaylistName', () => {
  it('includes the seed and falls back for blank seeds', () => {
    expect(buildDiscoverPlaylistName('Cher')).toBe(
      'Blendify · Discover · Cher',
    )
    expect(buildDiscoverPlaylistName('  ')).toBe(
      'Blendify · Discover · Discover',
    )
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

    expect(buildDefaultPlaylistDescription([], translate)).toBe(
      'playlist.description.empty:{}',
    )
    expect(buildDefaultPlaylistDescription(['Sade'], translate)).toBe(
      'playlist.description.one:{"name":"Sade"}',
    )
    expect(
      buildDefaultPlaylistDescription(['Sade', 'Prince'], translate),
    ).toBe('playlist.description.two:{"first":"Sade","second":"Prince"}')
    expect(
      buildDefaultPlaylistDescription(['Sade', 'Prince', 'Björk'], translate),
    ).toBe('playlist.description.many:{"first":"Sade","count":2}')
  })

  it('keeps the English fallback for non-UI callers', () => {
    expect(buildDefaultPlaylistDescription([])).toBe('Made with Blendify.')
    expect(buildDefaultPlaylistDescription(['Sade'])).toBe(
      'Made with Blendify from Sade.',
    )
    expect(buildDefaultPlaylistDescription(['A', 'B'])).toBe(
      'Made with Blendify from A and B.',
    )
    expect(buildDefaultPlaylistDescription(['A', 'B', 'C'])).toBe(
      'Made with Blendify from A and 2 more.',
    )
  })
})
