import type { UserUsageStats } from '@blendify/contracts'

export function isUsageStatsEmpty(stats: UserUsageStats): boolean {
  return (
    stats.uniqueArtists === 0 &&
    stats.uniqueGenres === 0 &&
    stats.artistMixCount === 0 &&
    stats.genreMixCount === 0
  )
}

export function barWidthPercent(count: number, max: number): number {
  if (max <= 0 || count <= 0) return 0
  return Math.min(100, (count / max) * 100)
}
