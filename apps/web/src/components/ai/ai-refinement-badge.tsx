import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type AiRefinementBadgeProps = Readonly<{
  tone: 'added' | 'removed' | 'moved' | 'kept'
  icon: ReactNode
  children: ReactNode
  label?: string
}>

const TONE_CLASS_NAMES: Record<AiRefinementBadgeProps['tone'], string> = {
  added: 'border-accent-line text-accent-fg',
  removed: 'border-danger-line text-danger',
  moved: 'border-control text-cream-200',
  kept: 'border-divider text-cream-300',
}

export function AiRefinementBadge({ tone, icon, children, label }: AiRefinementBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4',
        TONE_CLASS_NAMES[tone],
      )}
    >
      {icon}
      {label ? (
        <>
          <span aria-hidden>{children}</span>
          <span className="sr-only">{label}</span>
        </>
      ) : (
        children
      )}
    </span>
  )
}
