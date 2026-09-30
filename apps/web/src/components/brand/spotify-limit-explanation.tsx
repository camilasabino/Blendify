import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useT } from '@/i18n/use-t'
import { cn } from '@/lib/utils'

export function SpotifyLimitExplanation() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const panelId = useId()

  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-cream-300 underline-offset-4 hover:text-cream-50 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
      >
        {open ? t('errors.spotifyLimit.hide') : t('errors.spotifyLimit.why')}
        <ChevronDown
          aria-hidden
          className={cn('size-4 transition-transform', open && 'rotate-180')}
        />
      </button>
      <p
        id={panelId}
        hidden={!open}
        className="text-sm leading-relaxed text-cream-300"
      >
        {t('errors.spotifyLimit.explanation')}
      </p>
    </div>
  )
}
