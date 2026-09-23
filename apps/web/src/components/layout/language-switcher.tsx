import { useEffect, useId, type KeyboardEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { usePopover, popoverSurfaceClass } from '@/hooks/use-popover'
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

const LOCALE_NAME_KEY = {
  en: 'lang.enName',
  es: 'lang.esName',
  pt: 'lang.ptName',
} as const

const LOCALE_TAG: Record<Locale, string> = {
  en: 'en',
  es: 'es',
  pt: 'pt-BR',
}

type LanguageSwitcherProps = Readonly<{
  className?: string
}>

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const locale = useLocaleStore((s) => s.locale)
  const setLocale = useLocaleStore((s) => s.setLocale)
  const t = useT()
  const menuId = useId()
  const popover = usePopover<HTMLUListElement>({ align: 'end' })
  const { open, focusItem } = popover

  useEffect(() => {
    if (open) focusItem('selected')
  }, [open, focusItem])

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    if (open) focusItem(event.key === 'ArrowUp' ? 'last' : 'first')
    else popover.setOpen(true)
  }

  function select(code: Locale) {
    setLocale(code)
    popover.close(true)
  }

  return (
    <div ref={popover.rootRef} className={cn('relative inline-flex', className)}>
      <button
        ref={popover.triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${t('lang.label')}: ${t(LOCALE_NAME_KEY[locale])}`}
        title={t('lang.label')}
        onClick={popover.toggle}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-control px-2 text-sm font-medium text-cream-200 transition-colors hover:bg-hover hover:text-cream-50',
          open && 'bg-hover text-cream-50',
          focusRing,
        )}
      >
        <span aria-hidden className="text-base leading-none">
          {LOCALE_FLAG[locale]}
        </span>
        <span>{t(LOCALE_CODE_KEY[locale])}</span>
        <ChevronDown
          aria-hidden
          className={cn(
            'size-3.5 text-cream-400 transition-transform motion-reduce:transition-none',
            open && 'rotate-180',
          )}
        />
      </button>

      {open ? (
        <ul
          ref={popover.panelRef}
          id={menuId}
          role="menu"
          aria-label={t('lang.label')}
          data-popover-panel
          data-placement={popover.placement}
          style={popover.panelStyle}
          onKeyDown={popover.onPanelKeyDown}
          className={cn(popoverSurfaceClass, 'w-max min-w-44 rounded-card py-1')}
        >
          {LOCALES.map((code) => {
            const selected = code === locale
            return (
              <li key={code} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  tabIndex={-1}
                  lang={LOCALE_TAG[code]}
                  data-popover-item
                  onClick={() => select(code)}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
                    selected ? 'text-accent-fg' : 'text-cream-100',
                  )}
                >
                  <span aria-hidden className="text-base leading-none">
                    {LOCALE_FLAG[code]}
                  </span>
                  <span className="flex-1">{t(LOCALE_NAME_KEY[code])}</span>
                  <Check
                    aria-hidden
                    className={cn('size-3.5', !selected && 'invisible')}
                  />
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
