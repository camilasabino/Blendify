import { en, type MessageKey } from './locales/en'
import { es } from './locales/es'
import { pt } from './locales/pt'

export type { MessageKey }
export type Locale = 'en' | 'es' | 'pt'

export const LOCALES: Locale[] = ['en', 'es', 'pt']

export function isLocale(value: string): value is Locale {
  return (LOCALES as string[]).includes(value)
}

export const messages: Record<Locale, Record<MessageKey, string>> = {
  en: en as Record<MessageKey, string>,
  es,
  pt,
}
