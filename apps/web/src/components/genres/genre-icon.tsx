import { resolveGenreIcon } from '@/lib/genre-icon-map'
import { cn } from '@/lib/utils'

type GenreIconProps = {
  name: string
  id?: string
  className?: string
  iconClassName?: string
}

export function GenreIcon({
  name,
  id,
  className,
  iconClassName,
}: GenreIconProps) {
  const Icon = resolveGenreIcon(name, id)
  return (
    <span
      className={cn(
        'inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-charcoal-700/90 text-amber-300/90',
        className,
      )}
      aria-hidden
    >
      <Icon className={cn('size-3.5', iconClassName)} strokeWidth={1.75} />
    </span>
  )
}
