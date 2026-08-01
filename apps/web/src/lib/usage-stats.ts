import type { UserUsageStats } from '@blendify/contracts'

export function isUsageStatsEmpty(stats: UserUsageStats): boolean {
  return (
    stats.uniqueArtists === 0 &&
    stats.uniqueGenres === 0 &&
    stats.artistMixCount === 0 &&
    stats.genreMixCount === 0
  )
}
