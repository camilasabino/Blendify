import type { ReleaseRange } from '@blendify/contracts'
import type { MessageKey } from '@/i18n/messages'

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

const DECADE_YEARS = 10

const FIRST_RELEASE_DECADE = 1950

export function releaseDecades(currentYear: number): number[] {
  const currentDecade = Math.floor(currentYear / DECADE_YEARS) * DECADE_YEARS
  const decades: number[] = []
  for (let decade = currentDecade; decade >= FIRST_RELEASE_DECADE; decade -= DECADE_YEARS) {
    decades.push(decade)
  }
  return decades
}

export function decadeReleaseRange(
  decade: number,
  currentYear: number,
): ReleaseRange {
  return {
    fromYear: decade,
    toYear: Math.min(decade + DECADE_YEARS - 1, currentYear),
  }
}

export function releaseRangeDecade(
  range: ReleaseRange | null,
  currentYear: number,
): number | null {
  if (range === null) {
    return null
  }

  return (
    releaseDecades(currentYear).find((decade) => {
      const candidate = decadeReleaseRange(decade, currentYear)
      return (
        range.fromYear === candidate.fromYear &&
        range.toYear === candidate.toYear
      )
    }) ?? null
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
