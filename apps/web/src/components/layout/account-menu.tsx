import { useEffect, useId, type KeyboardEvent } from 'react'
import { LogOut, Music2 } from 'lucide-react'
import { SpotifyIcon } from '@/components/brand/spotify-mark'
import { usePopover, popoverSurfaceClass } from '@/hooks/use-popover'
import { useT } from '@/i18n/use-t'
import { cn, focusRing } from '@/lib/utils'

type AccountMenuProps = Readonly<{
  displayName?: string
  imageUrl?: string | null
  onLogOut: () => void
}>

export function AccountMenu({
  displayName,
  imageUrl,
  onLogOut,
}: AccountMenuProps) {
  const t = useT()
  const menuId = useId()
  const popover = usePopover<HTMLDivElement>({ align: 'end' })
  const { open, focusItem } = popover
  const label = displayName
    ? `${t('nav.account')}: ${displayName}`
    : t('nav.account')

  useEffect(() => {
    if (open) focusItem('first')
  }, [open, focusItem])

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    if (open) focusItem(event.key === 'ArrowUp' ? 'last' : 'first')
    else popover.setOpen(true)
  }

  function logOut() {
    popover.close(false)
    onLogOut()
  }

  return (
    <div ref={popover.rootRef} className="relative inline-flex">
      <button
        ref={popover.triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        title={label}
        onClick={popover.toggle}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          'relative inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-85',
          focusRing,
        )}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className={cn(
              'size-8 rounded-full object-cover ring-1 transition-shadow',
              open ? 'ring-2 ring-accent-line' : 'ring-divider',
            )}
          />
        ) : (
          <span
            className={cn(
              'flex size-8 items-center justify-center rounded-full bg-charcoal-700 ring-1 transition-shadow',
              open ? 'ring-2 ring-accent-line' : 'ring-divider',
            )}
          >
            <Music2 aria-hidden className="size-4 text-accent-fg" />
          </span>
        )}
      </button>

      {open ? (
        <div
          ref={popover.panelRef}
          id={menuId}
          role="menu"
          tabIndex={-1}
          aria-label={t('nav.account')}
          data-popover-panel
          data-placement={popover.placement}
          style={popover.panelStyle}
          onKeyDown={popover.onPanelKeyDown}
          className={cn(popoverSurfaceClass, 'w-max min-w-44 max-w-64 rounded-card py-1')}
        >
          {displayName ? (
            <p className="flex items-center gap-[11px] border-b border-divider px-3 pb-2 pt-1.5 text-xs text-cream-400">
              <SpotifyIcon alt="Spotify" />
              <span className="min-w-0 truncate">{displayName}</span>
            </p>
          ) : null}
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            data-popover-item
            onClick={logOut}
            className="mt-1 flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-cream-100 transition-colors first:mt-0 hover:bg-hover focus-visible:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
          >
            <LogOut aria-hidden className="size-4 text-cream-400" />
            {t('nav.logOut')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
