import { describe, expect, it } from 'vitest'
import { formatSongCount } from './song-count'
import type { useT } from '@/i18n/use-t'

const translate = ((
  key: 'common.songsOne' | 'common.songsMany',
  vars?: Record<string, string | number>,
) => `${key}:${JSON.stringify(vars ?? {})}`) as ReturnType<typeof useT>

describe('formatSongCount', () => {
  it('uses the singular key when count is 1', () => {
    expect(formatSongCount(1, translate)).toBe('common.songsOne:{}')
  })

  it('uses the plural key with the count when count is not 1', () => {
    expect(formatSongCount(0, translate)).toBe(
      'common.songsMany:{"count":0}',
    )
    expect(formatSongCount(5, translate)).toBe(
      'common.songsMany:{"count":5}',
    )
  })
})
