import { useId, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn, focusRing } from '@/lib/utils'

type FormSectionDisclosure = Readonly<{
  expanded: boolean
  onToggle: () => void
  summary: string
}>

type FormSectionProps = Readonly<{
  step?: number | string
  title: string
  description?: string
  children: ReactNode
  className?: string
  accent?: 'amber' | 'soft'
  disclosure?: FormSectionDisclosure
}>

export function FormSection({
  step,
  title,
  description,
  children,
  className,
  accent = 'soft',
  disclosure,
}: FormSectionProps) {
  const emphasized = accent === 'amber'
  const contentId = useId()
  const summaryId = useId()
  const collapsed = disclosure !== undefined && !disclosure.expanded

  return (
    <section
      className={cn(
        'rounded-panel border bg-panel p-5 shadow-[0_24px_60px_-36px_rgb(0_0_0_/_0.95)] sm:p-6',
        emphasized
          ? 'border-accent-line/40 bg-linear-to-b from-amber-500/[0.08] to-transparent to-40%'
          : 'border-divider',
        collapsed &&
          'transition-colors hover:border-control-hover hover:bg-hover motion-reduce:transition-none',
        className,
      )}
    >
      <header
        className={cn(
          'relative flex items-start gap-3',
          !collapsed && 'mb-5 border-b border-divider pb-4',
        )}
      >
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
            {disclosure ? (
              <button
                type="button"
                aria-expanded={disclosure.expanded}
                aria-controls={contentId}
                aria-describedby={collapsed ? summaryId : undefined}
                onClick={disclosure.onToggle}
                className={cn(
                  'flex w-full cursor-pointer items-center justify-between gap-3 rounded-control text-left tracking-tight after:absolute after:inset-0 after:content-[""]',
                  focusRing,
                )}
              >
                <span>{title}</span>
                <ChevronDown
                  aria-hidden
                  className={cn(
                    'size-5 shrink-0 text-cream-400 transition-transform motion-reduce:transition-none',
                    disclosure.expanded && 'rotate-180',
                  )}
                />
              </button>
            ) : (
              title
            )}
          </h2>
          {collapsed ? (
            <p
              id={summaryId}
              className="mt-1 text-sm leading-relaxed text-cream-400"
            >
              {disclosure.summary}
            </p>
          ) : null}
          {description ? (
            <p className="mt-1 text-sm leading-relaxed text-cream-400">
              {description}
            </p>
          ) : null}
        </div>
      </header>

      <div
        id={disclosure ? contentId : undefined}
        hidden={collapsed}
        className="space-y-4"
      >
        {collapsed ? null : children}
      </div>
    </section>
  )
}
