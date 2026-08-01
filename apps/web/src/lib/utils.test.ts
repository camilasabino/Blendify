import { describe, expect, it, vi } from 'vitest'
import {
  cn,
  copyToClipboard,
  estimateTrackCount,
  formatDate,
  formatDuration,
  maxTracksPerArtist,
  maxTracksPerGenre,
  normalizeArtistName,
} from '@/lib/utils'

describe('cn', () => {
  it('merges tailwind classes without conflicts', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4')
  })
})

describe('track limits', () => {
  it('divides the 50-track cap by artist count', () => {
    expect(maxTracksPerArtist(0)).toBe(50)
    expect(maxTracksPerArtist(1)).toBe(50)
    expect(maxTracksPerArtist(2)).toBe(25)
    expect(maxTracksPerArtist(8)).toBe(6)
    expect(maxTracksPerArtist(12)).toBe(4)
  })

  it('divides the 50-track cap by genre count', () => {
    expect(maxTracksPerGenre(0)).toBe(50)
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

  it('returns 0:00 for invalid durations', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(Number.NaN)).toBe('0:00')
  })
})

describe('formatDate', () => {
  it('formats valid ISO dates and falls back for invalid ones', () => {
    expect(formatDate('not-a-date')).toBe('—')
    const formatted = formatDate('2024-06-15T12:00:00.000Z', 'en')
    expect(formatted).toMatch(/2024/)
    expect(formatDate('2024-06-15T12:00:00.000Z', 'pt')).toMatch(/2024/)
  })
})

describe('normalizeArtistName', () => {
  it('normalizes accents, ampersands, and punctuation', () => {
    expect(normalizeArtistName('Björk & Friends!')).toBe('bjork and friends')
  })
})

describe('copyToClipboard', () => {
  it('returns true when clipboard write succeeds', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
    await expect(copyToClipboard('hi')).resolves.toBe(true)
  })

  it('returns false when clipboard write fails', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    await expect(copyToClipboard('hi')).resolves.toBe(false)
  })
})
