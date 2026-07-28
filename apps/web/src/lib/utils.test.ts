import { describe, expect, it } from 'vitest'
import {
  cn,
  estimateSongCount,
  formatDuration,
  maxSongsPerArtist,
  maxSongsPerGenre,
} from '@/lib/utils'

describe('cn', () => {
  it('merges tailwind classes without conflicts', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4')
  })
})

describe('song limits', () => {
  it('caps artists at 25 and divides 200 by count', () => {
    expect(maxSongsPerArtist(1)).toBe(25)
    expect(maxSongsPerArtist(2)).toBe(25)
    expect(maxSongsPerArtist(8)).toBe(25)
    expect(maxSongsPerArtist(25)).toBe(8)
  })

  it('divides 200 by genre count', () => {
    expect(maxSongsPerGenre(1)).toBe(200)
    expect(maxSongsPerGenre(2)).toBe(100)
    expect(maxSongsPerGenre(4)).toBe(50)
  })
})

describe('estimateSongCount', () => {
  it('multiplies artists by songs per artist', () => {
    expect(estimateSongCount(10, 5)).toEqual({ total: 50, capped: false })
  })

  it('caps at 200 and flags when exceeded', () => {
    expect(estimateSongCount(25, 10)).toEqual({ total: 200, capped: true })
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
