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
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-2xl border p-5 shadow-[0_24px_60px_-36px_rgb(0_0_0_/_0.95)] sm:p-6',
        accent === 'amber'
          ? 'border-amber-500/25 bg-gradient-to-br from-amber-500/[0.12] via-charcoal-800/90 to-charcoal-950'
          : 'border-cream-200/12 bg-gradient-to-br from-charcoal-800/95 via-charcoal-900/90 to-[#12100e]',
        className,
      )}
    >
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute rounded-full blur-3xl',
          accent === 'amber'
            ? '-right-10 -top-14 size-48 bg-amber-500/25'
            : '-right-12 -top-16 size-44 bg-amber-500/12',
        )}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-16 -left-10 size-40 rounded-full bg-amber-700/10 blur-3xl"
      />

      <header className="relative mb-5 flex items-start gap-3 border-b border-cream-200/10 pb-4">
        {step != null ? (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 font-display text-sm font-bold text-amber-400 ring-1 ring-amber-500/35">
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

      <div className="relative space-y-4">{children}</div>
    </section>
  )
}
