import type { MixModeId } from '@/lib/api'

const MIX_SHORT: Record<MixModeId, string> = {
  popular: 'Popular',
  balanced: 'Balanced',
  rarities: 'Rarities',
  mood_energetic: 'Energetic',
  mood_chill: 'Chill',
  mood_melancholic: 'Melancholic',
}

export function mixModeShortLabel(mixMode: MixModeId): string {
  return MIX_SHORT[mixMode] ?? 'Balanced'
}

export function buildDefaultPlaylistName(input: {
  mode: 'artists' | 'genres'
  names: string[]
  mixMode: MixModeId
  mixLabel?: string
}): string {
  const mix = (input.mixLabel ?? mixModeShortLabel(input.mixMode)).trim()
  const names = input.names.map((n) => n.trim()).filter(Boolean)

  if (names.length === 0) return ''

  let core: string
  if (names.length === 1) {
    core = `${names[0]} · ${mix}`
  } else if (names.length === 2) {
    core = `${names[0]} + ${names[1]} · ${mix}`
  } else {
    core = `${names[0]} + ${names.length - 1} · ${mix}`
  }

  return truncate(`Blendify · ${core}`)
}

function truncate(value: string, max = 100): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}
