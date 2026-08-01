import { useEffect, useId, useRef, useState } from 'react'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useT } from '@/i18n/use-t'
import {
  readPersistToLibraryPreference,
  writePersistToLibraryPreference,
} from '@/lib/persist-to-library-preference'
import { cn, focusRing } from '@/lib/utils'

export function PreferencesMenu() {
  const t = useT()
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [persistToLibrary, setPersistToLibrary] = useState(() =>
    readPersistToLibraryPreference(),
  )

  useEffect(() => {
    if (!open) return
    setPersistToLibrary(readPersistToLibraryPreference())

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target)) {
        setOpen(false)
      }
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
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={t('preferences.open')}
        aria-expanded={open}
        aria-controls={panelId}
        title={t('preferences.open')}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'size-8 sm:size-9',
          open && 'bg-charcoal-700/80 text-cream-50',
        )}
      >
        <Settings className="size-4" />
      </Button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={t('preferences.title')}
          className={cn(
            'absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-cream-200/10 bg-charcoal-900/95 p-4 shadow-xl shadow-black/40 backdrop-blur-md',
            focusRing,
          )}
        >
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-amber-400/90">
            {t('preferences.title')}
          </p>
          <p className="mt-1 text-xs text-cream-500">
            {t('preferences.subtitle')}
          </p>

          <div className="mt-4 flex items-start justify-between gap-4 rounded-xl border border-cream-200/10 bg-charcoal-800/50 px-3 py-3">
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
        </div>
      )}
    </div>
  )
}
