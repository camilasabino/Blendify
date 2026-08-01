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
  const localeTag = locale === 'pt' ? 'pt-BR' : locale
  return new Intl.DateTimeFormat(localeTag ?? undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export function normalizeArtistName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export const PLAYLIST_TRACK_CAP = 50

export function maxTracksPerArtist(artistCount: number): number {
  if (artistCount <= 0) return PLAYLIST_TRACK_CAP
  return Math.floor(PLAYLIST_TRACK_CAP / artistCount)
}

export function maxTracksPerGenre(genreCount: number): number {
  if (genreCount <= 0) return PLAYLIST_TRACK_CAP
  return Math.floor(PLAYLIST_TRACK_CAP / genreCount)
}

export function estimateTrackCount(
  seedCount: number,
  tracksPerSeed: number,
  cap = PLAYLIST_TRACK_CAP,
): { total: number; capped: boolean } {
  const raw = Math.max(0, seedCount) * Math.max(0, tracksPerSeed)
  return { total: Math.min(raw, cap), capped: raw > cap }
}
