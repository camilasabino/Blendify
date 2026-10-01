import { useEffect, useId, type KeyboardEvent } from 'react'
import { Check, ChevronDown, Globe } from 'lucide-react'
import { MUSIC_REGIONS, type MusicRegion } from '@blendify/contracts'
import { REGION_LABEL_KEYS } from '@/components/genres/genre-labels'
import type { MessageKey } from '@/i18n/messages'
import { Label } from '@/components/ui/label'
import { popoverSurfaceClass, usePopover } from '@/hooks/use-popover'
import { useT } from '@/i18n/use-t'
import { cn, focusRing } from '@/lib/utils'

type RegionSelectProps = Readonly<{
  value: MusicRegion | null
  hintKey: MessageKey
  onChange: (region: MusicRegion | null) => void
}>

export function RegionSelect({ value, hintKey, onChange }: RegionSelectProps) {
  const t = useT()
  const baseId = useId()
  const triggerId = `${baseId}-trigger`
  const listboxId = `${baseId}-listbox`
  const hintId = `${baseId}-hint`
  const popover = usePopover<HTMLDivElement>({ align: 'start' })
  const { open, focusItem } = popover

  useEffect(() => {
    if (open) {
      focusItem('selected')
    }
  }, [open, focusItem])

  const options: ReadonlyArray<{ id: MusicRegion | null; label: string }> = [
    { id: null, label: t('create.regionAny') },
    ...MUSIC_REGIONS.map((region) => ({
      id: region,
      label: t(REGION_LABEL_KEYS[region]),
    })),
  ]
  const selectedLabel = options.find((option) => option.id === value)?.label

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return
    }
    event.preventDefault()
    if (open) {
      focusItem(event.key === 'ArrowUp' ? 'last' : 'first')
    } else {
      popover.setOpen(true)
    }
  }

  function select(region: MusicRegion | null) {
    onChange(region)
    popover.close(true)
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={triggerId}>{t('create.region')}</Label>
      <div ref={popover.rootRef} className="relative w-full sm:max-w-xs">
        <button
          ref={popover.triggerRef}
          id={triggerId}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-describedby={hintId}
          onClick={popover.toggle}
          onKeyDown={onTriggerKeyDown}
          className={cn(
            'flex h-10 w-full items-center gap-2 rounded-control border border-control bg-field px-3 text-left text-sm transition-colors duration-200 hover:border-control-hover',
            value ? 'border-accent-line text-cream-50' : 'text-cream-200',
            focusRing,
          )}
        >
          <Globe aria-hidden className="size-4 shrink-0 text-cream-400" />
          <span className="flex-1 truncate">{selectedLabel}</span>
          <ChevronDown
            aria-hidden
            className={cn(
              'size-4 shrink-0 text-cream-400 transition-transform motion-reduce:transition-none',
              open && 'rotate-180',
            )}
          />
        </button>

        {open ? (
          <div
            ref={popover.panelRef}
            id={listboxId}
            role="listbox"
            aria-labelledby={triggerId}
            data-popover-panel
            data-placement={popover.placement}
            style={popover.panelStyle}
            onKeyDown={popover.onPanelKeyDown}
            className={cn(
              popoverSurfaceClass,
              'w-max min-w-full rounded-card py-1',
            )}
          >
            {options.map((option) => {
              const selected = option.id === value
              return (
                <button
                  key={option.id ?? 'any'}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  tabIndex={-1}
                  data-popover-item
                  onClick={() => select(option.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
                    selected ? 'text-accent-fg' : 'text-cream-100',
                  )}
                >
                  <span className="flex-1">{option.label}</span>
                  <Check
                    aria-hidden
                    className={cn('size-3.5', !selected && 'invisible')}
                  />
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
      <p id={hintId} className="text-sm text-cream-400">
        {t(hintKey)}
      </p>
    </div>
  )
}
