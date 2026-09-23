import { ChevronDown } from 'lucide-react'
import { useT } from '@/i18n/use-t'
import { cn, focusRing } from '@/lib/utils'

export function TrackListToggle({
  expanded,
  total,
  controls,
  onToggle,
}: Readonly<{
  expanded: boolean
  total: number
  controls: string
  onToggle: () => void
}>) {
  const t = useT()
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onToggle}
      className={cn(
        'flex min-h-10 w-full items-center justify-center gap-1.5 border-t border-divider px-3 text-sm font-medium text-accent-fg transition-colors hover:bg-hover hover:text-amber-300',
        focusRing,
      )}
    >
      {expanded
        ? t('preview.showFewer')
        : t('preview.showAll', { count: total })}
      <ChevronDown
        aria-hidden
        className={cn(
          'size-4 transition-transform motion-reduce:transition-none',
          expanded && 'rotate-180',
        )}
      />
    </button>
  )
}
