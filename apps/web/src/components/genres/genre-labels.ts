import { useCallback } from 'react'
import { getGenreDisplayLabel, type MusicRegion } from '@blendify/contracts'
import type { Locale, MessageKey } from '@/i18n/messages'
import { useLocaleStore } from '@/i18n/use-locale'

export const REGION_LABEL_KEYS: Record<MusicRegion, MessageKey> = {
  latin: 'region.latin',
  american: 'region.american',
  british: 'region.british',
  argentina: 'region.argentina',
  brazilian: 'region.brazilian',
  uruguay: 'region.uruguay',
  colombia: 'region.colombia',
  mexico: 'region.mexico',
  chile: 'region.chile',
  peru: 'region.peru',
  venezuela: 'region.venezuela',
  spanish: 'region.spanish',
}

export type GenreLabelSource = Readonly<{ id?: string; name: string }>

export function genreLabel(genre: GenreLabelSource, locale: Locale): string {
  return getGenreDisplayLabel(genre, locale)
}

export function useGenreLabel(): (genre: GenreLabelSource) => string {
  const locale = useLocaleStore((state) => state.locale)
  return useCallback((genre) => genreLabel(genre, locale), [locale])
}
