import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

export const pageGutter = 'mx-auto w-full max-w-4xl px-4 sm:px-6'

export const shellGutter = 'mx-auto w-full max-w-6xl px-4 sm:px-6'

export const focusWithinRing =
  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus'

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

export function formatListeningTime(ms: number): string {
  const totalMinutes =
    Number.isFinite(ms) && ms > 0 ? Math.max(1, Math.round(ms / 60_000)) : 0
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${totalMinutes} min`
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`
}

export function formatShortDate(
  iso: string,
  locale?: string,
  now: Date = new Date(),
): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const localeTag = locale === 'pt' ? 'pt-BR' : locale
  const sameYear = date.getFullYear() === now.getFullYear()
  return new Intl.DateTimeFormat(localeTag ?? undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date)
}

export function normalizeArtistName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replaceAll('&', 'and')
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
