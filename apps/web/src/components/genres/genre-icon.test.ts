import { describe, expect, it } from 'vitest'
import {
  AudioWaveform,
  CloudMoon,
  Disc3,
  Flame,
  Guitar,
  Mic2,
  Music2,
  Sparkles,
  Star,
} from 'lucide-react'
import { resolveGenreIcon } from '@/lib/genre-icon-map'

describe('resolveGenreIcon', () => {
  it('maps common genres to meaningful icons', () => {
    expect(resolveGenreIcon('Pop')).toBe(Sparkles)
    expect(resolveGenreIcon('Rock')).toBe(Guitar)
    expect(resolveGenreIcon('Hip Hop')).toBe(Mic2)
    expect(resolveGenreIcon('K-Pop')).toBe(Star)
    expect(resolveGenreIcon('Reggaeton')).toBe(Flame)
    expect(resolveGenreIcon('Deep House')).toBe(Disc3)
    expect(resolveGenreIcon('Lo-Fi')).toBe(CloudMoon)
    expect(resolveGenreIcon('Drum and Bass')).toBe(AudioWaveform)
  })

  it('falls back to music for unknown genres', () => {
    expect(resolveGenreIcon('xyzzy-unknown-genre')).toBe(Music2)
  })
})
