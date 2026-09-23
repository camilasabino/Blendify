import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type FormSectionProps = Readonly<{
  step?: number | string
  title: string
  description?: string
  children: ReactNode
  className?: string
  accent?: 'amber' | 'soft'
}>

export function FormSection({
  step,
  title,
  description,
  children,
  className,
  accent = 'soft',
}: FormSectionProps) {
  const emphasized = accent === 'amber'

  return (
    <section
      className={cn(
        'rounded-panel border bg-panel p-5 shadow-[0_24px_60px_-36px_rgb(0_0_0_/_0.95)] sm:p-6',
        emphasized
          ? 'border-accent-line/40 bg-linear-to-b from-amber-500/[0.08] to-transparent to-40%'
          : 'border-divider',
        className,
      )}
    >
      <header className="mb-5 flex items-start gap-3 border-b border-divider pb-4">
        {step != null ? (
          <span
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-control font-display text-sm font-bold',
              emphasized
                ? 'bg-accent-soft text-accent-fg ring-1 ring-inset ring-accent-line'
                : 'bg-charcoal-700 text-accent-fg',
            )}
          >
            {step}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold tracking-tight text-cream-50">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm leading-relaxed text-cream-400">
              {description}
            </p>
          ) : null}
        </div>
      </header>

      <div className="space-y-4">{children}</div>
    </section>
  )
}
