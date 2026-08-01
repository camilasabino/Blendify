import { describe, expect, it } from 'vitest'
import { isUsageStatsEmpty } from '@/lib/usage-stats'

describe('usage stats emptiness', () => {
  it('is empty with zero counters', () => {
    expect(
      isUsageStatsEmpty({
        artistMixCount: 0,
        genreMixCount: 0,
        uniqueArtists: 0,
        uniqueGenres: 0,
        topArtists: [],
        topGenres: [],
      }),
    ).toBe(true)
  })

  it('is not empty when mixes exist without unique seeds yet', () => {
    expect(
      isUsageStatsEmpty({
        artistMixCount: 2,
        genreMixCount: 0,
        uniqueArtists: 0,
        uniqueGenres: 0,
        topArtists: [],
        topGenres: [],
      }),
    ).toBe(false)
  })
})
