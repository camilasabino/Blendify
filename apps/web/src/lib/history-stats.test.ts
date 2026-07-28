import { describe, expect, it } from 'vitest'
import type { Playlist } from '@/lib/api'
import { computeHistoryStats } from '@/components/playlist/history-stats'

function playlist(partial: Partial<Playlist> & Pick<Playlist, 'id'>): Playlist {
  return {
    id: partial.id,
    name: partial.name ?? 'P',
    description: partial.description ?? '',
    spotifyId: partial.spotifyId ?? null,
    spotifyUrl: partial.spotifyUrl ?? null,
    imageUrl: partial.imageUrl ?? null,
    trackCount: partial.trackCount ?? 0,
    totalDurationMs: partial.totalDurationMs ?? 0,
    status: partial.status ?? 'COMPLETED',
    missingOnSpotify: partial.missingOnSpotify ?? false,
    source: partial.source ?? 'artists',
    artists: partial.artists ?? [],
    tracks: partial.tracks ?? [],
    songsPerArtist: partial.songsPerArtist ?? 10,
    shuffle: partial.shuffle ?? true,
    mixMode: partial.mixMode ?? 'balanced',
    createdAt: partial.createdAt ?? new Date().toISOString(),
    updatedAt: partial.updatedAt ?? new Date().toISOString(),
  }
}

describe('computeHistoryStats', () => {
  it('aggregates active/deleted and source counts', () => {
    const stats = computeHistoryStats([
      playlist({
        id: '1',
        source: 'artists',
        trackCount: 10,
        artists: [{ id: 'a1', name: 'Sade', imageUrl: null }],
      }),
      playlist({
        id: '2',
        source: 'genres',
        trackCount: 20,
        missingOnSpotify: true,
        artists: [{ id: 'genre:jazz', name: 'Jazz', imageUrl: null }],
      }),
    ])

    expect(stats.total).toBe(2)
    expect(stats.active).toBe(1)
    expect(stats.deleted).toBe(1)
    expect(stats.fromArtists).toBe(1)
    expect(stats.fromGenres).toBe(1)
    expect(stats.totalTracks).toBe(30)
    expect(stats.topArtists[0]?.name).toBe('Sade')
    expect(stats.topGenres[0]?.name).toBe('Jazz')
  })
})
