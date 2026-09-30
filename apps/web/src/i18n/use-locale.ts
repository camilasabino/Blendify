import { create } from 'zustand'
import { isLocale, type Locale } from './messages'

const STORAGE_KEY = 'blendify.locale'

const META_DESCRIPTION: Record<Locale, string> = {
  en: 'Blendify builds playlists from artists, genres, or a song. Connect Spotify to save them.',
  es: 'Blendify arma playlists a partir de artistas, géneros o una canción. Conecta Spotify para guardarlas.',
  pt: 'O Blendify monta playlists a partir de artistas, gêneros ou uma música. Conecte o Spotify para salvá-las.',
}

export const DOCUMENT_TITLE: Record<Locale, string> = {
  en: 'Blendify — Mix & Discover',
  es: 'Blendify — Mezcla y descubre',
  pt: 'Blendify — Misture e descubra',
}

const LOCALE_QUERY_PARAM = 'lang'

function readStoredLocale(): Locale | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && isLocale(stored)) {
      return stored
    }
  } catch {
    void 0
  }
  return null
}

function persistLocale(locale: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    void 0
  }
}

export function parseLocaleFromSearch(search: string): Locale | null {
  const value = new URLSearchParams(search).get(LOCALE_QUERY_PARAM)?.trim().toLowerCase()
  return value && isLocale(value) ? value : null
}

export function detectLocale(): Locale {
  if (typeof window !== 'undefined') {
    const fromUrl = parseLocaleFromSearch(window.location.search)
    if (fromUrl) {
      persistLocale(fromUrl)
      return fromUrl
    }
  }
  const stored = readStoredLocale()
  if (stored) {
    return stored
  }
  if (typeof navigator !== 'undefined') {
    const lang = navigator.language.toLowerCase()
    if (lang.startsWith('pt')) {
      return 'pt'
    }
    if (lang.startsWith('es')) {
      return 'es'
    }
  }
  return 'en'
}

function syncDocumentLocale(locale: Locale) {
  if (typeof document === 'undefined') {
    return
  }
  document.documentElement.lang = locale === 'pt' ? 'pt-BR' : locale
  document.title = DOCUMENT_TITLE[locale]
  const meta = document.querySelector('meta[name="description"]')
  if (meta) {
    meta.setAttribute('content', META_DESCRIPTION[locale])
  }
}

type LocaleState = {
  locale: Locale
  setLocale: (locale: Locale) => void
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: detectLocale(),
  setLocale: (locale) => {
    persistLocale(locale)
    syncDocumentLocale(locale)
    set({ locale })
  },
}))

syncDocumentLocale(useLocaleStore.getState().locale)
