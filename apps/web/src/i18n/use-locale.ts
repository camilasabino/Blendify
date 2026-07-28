import { create } from 'zustand'
import { isLocale, type Locale } from './messages'

const STORAGE_KEY = 'blendify.locale'

const META_DESCRIPTION: Record<Locale, string> = {
  en: 'Blendify — Build Spotify playlists from artists or genres.',
  es: 'Blendify — Crea playlists de Spotify con artistas o géneros.',
  pt: 'Blendify — Crie playlists do Spotify com artistas ou gêneros.',
}

function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && isLocale(stored)) return stored
  } catch {
    void 0
  }
  if (typeof navigator !== 'undefined') {
    const lang = navigator.language.toLowerCase()
    if (lang.startsWith('pt')) return 'pt'
    if (lang.startsWith('es')) return 'es'
  }
  return 'en'
}

function syncDocumentLocale(locale: Locale) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale === 'pt' ? 'pt-BR' : locale
  const meta = document.querySelector('meta[name="description"]')
  if (meta) meta.setAttribute('content', META_DESCRIPTION[locale])
}

type LocaleState = {
  locale: Locale
  setLocale: (locale: Locale) => void
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: detectLocale(),
  setLocale: (locale) => {
    try {
      localStorage.setItem(STORAGE_KEY, locale)
    } catch {
      void 0
    }
    syncDocumentLocale(locale)
    set({ locale })
  },
}))

syncDocumentLocale(useLocaleStore.getState().locale)
