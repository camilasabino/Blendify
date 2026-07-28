import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-charcoal-950'

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00'
  const totalSeconds = Math.round(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function formatDate(iso: string, locale?: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale ?? undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export const PLAYLIST_SONG_CAP = 200
export const MAX_SONGS_PER_ARTIST = 25

export function maxSongsPerArtist(artistCount: number): number {
  if (artistCount <= 0) return MAX_SONGS_PER_ARTIST
  return Math.min(
    MAX_SONGS_PER_ARTIST,
    Math.floor(PLAYLIST_SONG_CAP / artistCount),
  )
}

export function maxSongsPerGenre(genreCount: number): number {
  if (genreCount <= 0) return PLAYLIST_SONG_CAP
  return Math.floor(PLAYLIST_SONG_CAP / genreCount)
}

export function songCountOptions(max: number): number[] {
  if (max < 1) return [1]
  const preferred = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100, 125,
    150, 175, 200,
  ]
  const opts = preferred.filter((n) => n <= max)
  if (opts[opts.length - 1] !== max) opts.push(max)
  return opts
}

export function estimateSongCount(
  artistCount: number,
  songsPerArtist: number,
  cap = PLAYLIST_SONG_CAP,
): { total: number; capped: boolean } {
  const raw = Math.max(0, artistCount) * Math.max(0, songsPerArtist)
  return { total: Math.min(raw, cap), capped: raw > cap }
}
