import type { ReleaseRange } from '@blendify/contracts'
import type { MessageKey } from '@/i18n/messages'

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

const DECADE_YEARS = 10

export const RELEASE_DECADES = [
  2020, 2010, 2000, 1990, 1980, 1970, 1960, 1950,
] as const

export type ReleaseDecade = (typeof RELEASE_DECADES)[number]

export function decadeReleaseRange(decade: ReleaseDecade): ReleaseRange {
  return { fromYear: decade, toYear: decade + DECADE_YEARS - 1 }
}

export function releaseRangeDecade(
  range: ReleaseRange | null,
): ReleaseDecade | null {
  return (
    RELEASE_DECADES.find(
      (decade) =>
        range?.fromYear === decade &&
        range.toYear === decade + DECADE_YEARS - 1,
    ) ?? null
  )
}

export function releaseRangeLabel(range: ReleaseRange, t: Translate): string {
  if (range.fromYear !== undefined && range.toYear !== undefined) {
    return range.fromYear === range.toYear
      ? String(range.fromYear)
      : `${range.fromYear}–${range.toYear}`
  }
  return range.fromYear !== undefined
    ? t('create.releaseRangeFrom', { year: range.fromYear })
    : t('create.releaseRangeTo', { year: range.toYear ?? '' })
}
