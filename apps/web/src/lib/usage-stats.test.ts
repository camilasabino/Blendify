import { describe, expect, it } from 'vitest'
import { barWidthPercent, isUsageStatsEmpty } from '@/lib/usage-stats'

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

describe('barWidthPercent', () => {
  it('is linear relative to the highest count', () => {
    expect(barWidthPercent(10, 10)).toBe(100)
    expect(barWidthPercent(5, 10)).toBe(50)
    expect(barWidthPercent(1, 4)).toBe(25)
  })

  it('handles empty values', () => {
    expect(barWidthPercent(0, 10)).toBe(0)
    expect(barWidthPercent(3, 0)).toBe(0)
  })
})
