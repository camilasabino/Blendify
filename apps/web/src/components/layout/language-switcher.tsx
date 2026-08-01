import { useId } from 'react'
import { useLocaleStore } from '@/i18n/use-locale'
import { useT } from '@/i18n/use-t'
import { cn, focusRing } from '@/lib/utils'
import { LOCALES, type Locale } from '@/i18n/messages'

const LOCALE_FLAG: Record<Locale, string> = {
  en: '🇬🇧',
  es: '🇪🇸',
  pt: '🇧🇷',
}

const LOCALE_CODE_KEY = {
  en: 'lang.en',
  es: 'lang.es',
  pt: 'lang.pt',
} as const

type LanguageSwitcherProps = Readonly<{
  className?: string
}>

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const locale = useLocaleStore((s) => s.locale)
  const setLocale = useLocaleStore((s) => s.setLocale)
  const t = useT()
  const selectId = useId()

  return (
    <div className={cn('relative inline-flex', className)}>
      <label htmlFor={selectId} className="sr-only">
        {t('lang.label')}
      </label>
      <select
        id={selectId}
        value={locale}
        aria-label={t('lang.label')}
        onChange={(event) => setLocale(event.target.value as Locale)}
        className={cn(
          'h-8 appearance-none rounded-full border border-cream-200/10 bg-charcoal-800/70 py-0 pl-2.5 pr-7 text-xs font-medium text-cream-100 sm:h-9 sm:pl-3 sm:pr-8 sm:text-sm',
          focusRing,
        )}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_FLAG[code]} {t(LOCALE_CODE_KEY[code])}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-cream-500"
      >
        ▾
      </span>
    </div>
  )
}
