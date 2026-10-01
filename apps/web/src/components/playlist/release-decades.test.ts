import {
  decadeReleaseRange,
  releaseDecades,
  releaseRangeDecade,
} from '@/components/playlist/release-decades'

describe('release decades', () => {
  it('lists the current decade first and every past decade down to 1950', () => {
    expect(releaseDecades(2026)).toEqual([
      2020, 2010, 2000, 1990, 1980, 1970, 1960, 1950,
    ])
  })

  it('starts a new decade list when the year rolls over', () => {
    expect(releaseDecades(2029)[0]).toBe(2020)
    expect(releaseDecades(2030)).toEqual([
      2030, 2020, 2010, 2000, 1990, 1980, 1970, 1960, 1950,
    ])
  })

  it('ends the current decade at the current year', () => {
    expect(decadeReleaseRange(2020, 2026)).toEqual({ fromYear: 2020, toYear: 2026 })
    expect(decadeReleaseRange(2020, 2029)).toEqual({ fromYear: 2020, toYear: 2029 })
    expect(decadeReleaseRange(2030, 2030)).toEqual({ fromYear: 2030, toYear: 2030 })
  })

  it('keeps past decades complete', () => {
    expect(decadeReleaseRange(2010, 2026)).toEqual({ fromYear: 2010, toYear: 2019 })
    expect(decadeReleaseRange(1950, 2026)).toEqual({ fromYear: 1950, toYear: 1959 })
  })

  it('never asks for years after the current year', () => {
    for (const currentYear of [2026, 2029, 2030, 2035]) {
      for (const decade of releaseDecades(currentYear)) {
        expect(decadeReleaseRange(decade, currentYear).toYear).toBeLessThanOrEqual(
          currentYear,
        )
      }
    }
  })

  it('maps a range back to the decade it represents', () => {
    expect(releaseRangeDecade({ fromYear: 2020, toYear: 2026 }, 2026)).toBe(2020)
    expect(releaseRangeDecade({ fromYear: 1990, toYear: 1999 }, 2026)).toBe(1990)
    expect(releaseRangeDecade({ fromYear: 2030, toYear: 2030 }, 2030)).toBe(2030)
    expect(releaseRangeDecade({ fromYear: 1991, toYear: 1999 }, 2026)).toBeNull()
    expect(releaseRangeDecade(null, 2026)).toBeNull()
  })
})
