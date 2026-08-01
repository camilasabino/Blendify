import { describe, expect, it } from 'vitest'
import {
  cn,
  estimateTrackCount,
  formatDuration,
  maxTracksPerArtist,
  maxTracksPerGenre,
} from '@/lib/utils'

describe('cn', () => {
  it('merges tailwind classes without conflicts', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4')
  })
})

describe('track limits', () => {
  it('divides the 50-track cap by artist count', () => {
    expect(maxTracksPerArtist(1)).toBe(50)
    expect(maxTracksPerArtist(2)).toBe(25)
    expect(maxTracksPerArtist(8)).toBe(6)
    expect(maxTracksPerArtist(12)).toBe(4)
  })

  it('divides the 50-track cap by genre count', () => {
    expect(maxTracksPerGenre(1)).toBe(50)
    expect(maxTracksPerGenre(2)).toBe(25)
    expect(maxTracksPerGenre(4)).toBe(12)
  })
})

describe('estimateTrackCount', () => {
  it('multiplies artists by tracks per artist', () => {
    expect(estimateTrackCount(10, 5)).toEqual({ total: 50, capped: false })
  })

  it('caps at 50 and flags when exceeded', () => {
    expect(estimateTrackCount(25, 10)).toEqual({ total: 50, capped: true })
  })
})

describe('formatDuration', () => {
  it('formats milliseconds as m:ss', () => {
    expect(formatDuration(125_000)).toBe('2:05')
  })

  it('formats long durations with hours', () => {
    expect(formatDuration(3_661_000)).toBe('1:01:01')
  })
})
