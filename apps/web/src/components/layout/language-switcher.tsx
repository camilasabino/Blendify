import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { useLocaleStore } from '@/i18n/use-locale'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
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

const LOCALE_NAME_KEY = {
  en: 'lang.enName',
  es: 'lang.esName',
  pt: 'lang.ptName',
} as const

type LanguageSwitcherProps = {
  className?: string
}

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const locale = useLocaleStore((s) => s.locale)
  const setLocale = useLocaleStore((s) => s.setLocale)
  const t = useT()
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={t('lang.label')}
        aria-expanded={open}
        aria-controls={panelId}
        title={t('lang.label')}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'gap-1.5 px-2.5',
          open && 'bg-charcoal-700/80 text-cream-50',
        )}
      >
        <span aria-hidden className="text-[13px] leading-none">
          {LOCALE_FLAG[locale]}
        </span>
        <span className="tabular-nums">{t(LOCALE_CODE_KEY[locale])}</span>
        <ChevronDown
          className={cn(
            'size-3.5 text-cream-500 transition-transform',
            open && 'rotate-180',
          )}
        />
      </Button>

      {open && (
        <div
          id={panelId}
          role="listbox"
          aria-label={t('lang.label')}
          className={cn(
            'absolute right-0 z-50 mt-2 min-w-[11rem] rounded-xl border border-cream-200/10 bg-charcoal-900/95 p-1 shadow-xl shadow-black/40 backdrop-blur-md',
            focusRing,
          )}
        >
          {LOCALES.map((code) => {
            const selected = code === locale
            return (
              <button
                key={code}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  setLocale(code)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                  focusRing,
                  selected
                    ? 'bg-amber-500/15 text-cream-50'
                    : 'text-cream-200 hover:bg-charcoal-700/80 hover:text-cream-50',
                )}
              >
                <span aria-hidden className="text-[13px] leading-none">
                  {LOCALE_FLAG[code]}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {t(LOCALE_NAME_KEY[code])}
                </span>
                {selected && (
                  <Check className="size-3.5 shrink-0 text-amber-400" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
