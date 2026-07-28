import { useLocaleStore } from '@/i18n/use-locale'
import { useT } from '@/i18n/use-t'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { cn } from '@/lib/utils'
import { LOCALES, type Locale } from '@/i18n/messages'

const LOCALE_FLAG: Record<Locale, string> = {
  en: '🇬🇧',
  es: '🇪🇸',
  pt: '🇧🇷',
}

const LOCALE_LABEL_KEY = {
  en: 'lang.en',
  es: 'lang.es',
  pt: 'lang.pt',
} as const

type LanguageSwitcherProps = {
  className?: string
}

function LocaleLabel({ locale, code }: { locale: Locale; code: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="text-[13px] leading-none">
        {LOCALE_FLAG[locale]}
      </span>
      <span>{code}</span>
    </span>
  )
}

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const locale = useLocaleStore((s) => s.locale)
  const setLocale = useLocaleStore((s) => s.setLocale)
  const t = useT()

  return (
    <SegmentedControl<Locale>
      className={cn(className)}
      size="sm"
      ariaLabel={t('lang.label')}
      value={locale}
      onChange={setLocale}
      options={LOCALES.map((code) => ({
        value: code,
        label: <LocaleLabel locale={code} code={t(LOCALE_LABEL_KEY[code])} />,
      }))}
    />
  )
}
