import { useEffect, useId, useState } from 'react'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { usePopover, popoverSurfaceClass } from '@/hooks/use-popover'
import { useT } from '@/i18n/use-t'
import {
  readPersistToLibraryPreference,
  writePersistToLibraryPreference,
} from '@/lib/persist-to-library-preference'
import { cn } from '@/lib/utils'

export function PreferencesMenu() {
  const t = useT()
  const panelId = useId()
  const titleId = useId()
  const popover = usePopover<HTMLFieldSetElement>({ align: 'end' })
  const { open } = popover
  const [persistToLibrary, setPersistToLibrary] = useState(() =>
    readPersistToLibraryPreference(),
  )

  useEffect(() => {
    if (open) setPersistToLibrary(readPersistToLibraryPreference())
  }, [open])

  return (
    <div ref={popover.rootRef} className="relative">
      <Button
        ref={popover.triggerRef}
        type="button"
        size="icon"
        variant="ghost"
        aria-label={t('preferences.open')}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={t('preferences.open')}
        onClick={popover.toggle}
        className={cn(open && 'bg-hover text-cream-50')}
      >
        <Settings aria-hidden className="size-4" />
      </Button>

      {open && (
        <fieldset
          ref={popover.panelRef}
          id={panelId}
          aria-labelledby={titleId}
          data-popover-panel
          data-placement={popover.placement}
          style={popover.panelStyle}
          className={cn(
            popoverSurfaceClass,
            'w-88 rounded-panel border-0 p-4 m-0',
          )}
        >
          <legend id={titleId} className="text-eyebrow text-accent-fg">
            {t('preferences.title')}
          </legend>
          <p className="mt-1 text-xs text-cream-400">
            {t('preferences.subtitle')}
          </p>

          <div className="mt-4 flex items-start justify-between gap-4 rounded-card border border-divider bg-card p-3">
            <div className="min-w-0">
              <Label htmlFor="pref-persistToLibrary">
                {t('preferences.persistToLibrary')}
              </Label>
              <p className="mt-1 text-xs leading-relaxed text-cream-400">
                {t('preferences.persistToLibraryHint')}
              </p>
            </div>
            <Switch
              id="pref-persistToLibrary"
              checked={persistToLibrary}
              onCheckedChange={(checked) => {
                setPersistToLibrary(checked)
                writePersistToLibraryPreference(checked)
              }}
            />
          </div>
        </fieldset>
      )}
    </div>
  )
}
