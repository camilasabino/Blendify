import { describe, expect, it } from 'vitest'
import type { PlaylistSummary } from '@blendify/contracts'
import {
  buildSyncSummary,
  libraryDisplayTitle,
  libraryKindKey,
  pendingReferencesRemovedPlaylist,
} from './library-list-helpers'
import { activePlaylist } from '@/test/playlist-fixtures'

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

describe('buildSyncSummary', () => {
  const syncT = (key: string, vars?: Record<string, string | number>) => {
    const table: Record<string, string> = {
      'library.refreshSuccess': 'Library synced with Spotify.',
      'library.refreshSuccessOne':
        'Library synced with Spotify. 1 playlist removed because it no longer exists on Spotify.',
      'library.refreshSuccessMany':
        'Library synced with Spotify. {count} playlists removed because they no longer exist on Spotify.',
    }
    let text = table[key] ?? key
    for (const [name, value] of Object.entries(vars ?? {})) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
    return text
  }

  it('returns the plain success message when nothing was removed', () => {
    expect(buildSyncSummary(0, syncT as never)).toBe(
      'Library synced with Spotify.',
    )
  })

  it('uses the singular key for exactly one removal', () => {
    expect(buildSyncSummary(1, syncT as never)).toBe(
      'Library synced with Spotify. 1 playlist removed because it no longer exists on Spotify.',
    )
  })

  it('uses the plural key with the count for multiple removals', () => {
    expect(buildSyncSummary(3, syncT as never)).toBe(
      'Library synced with Spotify. 3 playlists removed because they no longer exist on Spotify.',
    )
  })
})

describe('pendingReferencesRemovedPlaylist', () => {
  it('is false when there is no pending confirm', () => {
    expect(pendingReferencesRemovedPlaylist(null, new Set(['playlist-1']))).toBe(
      false,
    )
  })

  it('is false for an alert, which references no playlist', () => {
    expect(
      pendingReferencesRemovedPlaylist(
        { kind: 'alert', title: 't', description: 'd' },
        new Set(),
      ),
    ).toBe(false)
  })

  it('is true when the pending single playlist is no longer visible', () => {
    expect(
      pendingReferencesRemovedPlaylist(
        { kind: 'delete', playlist: activePlaylist },
        new Set(['other-id']),
      ),
    ).toBe(true)
  })

  it('is false when the pending single playlist is still visible', () => {
    expect(
      pendingReferencesRemovedPlaylist(
        { kind: 'delete', playlist: activePlaylist },
        new Set([activePlaylist.id]),
      ),
    ).toBe(false)
  })

  it('is true when any id in a pending bulk action was removed', () => {
    expect(
      pendingReferencesRemovedPlaylist(
        { kind: 'bulk', action: 'clear_library', playlistIds: ['a', 'b'], count: 2 },
        new Set(['a']),
      ),
    ).toBe(true)
  })

  it('is false when every id in a pending bulk action is still visible', () => {
    expect(
      pendingReferencesRemovedPlaylist(
        { kind: 'bulk', action: 'clear_library', playlistIds: ['a', 'b'], count: 2 },
        new Set(['a', 'b']),
      ),
    ).toBe(false)
  })
})
