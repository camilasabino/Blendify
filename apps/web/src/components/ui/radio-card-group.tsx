import { useId, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type RadioCardOption<T extends string | number> = Readonly<{
  value: T
  label: ReactNode
  hint?: ReactNode
  icon?: LucideIcon
}>

export function RadioCardGroup<T extends string | number>({
  label,
  value,
  options,
  onChange,
  columns = 3,
}: Readonly<{
  label: string
  value: T
  options: readonly RadioCardOption<T>[]
  onChange: (value: T) => void
  columns?: 2 | 3
}>) {
  const name = useId()

  return (
    <fieldset>
      <legend className="sr-only">{label}</legend>
      <div
        className={cn(
          'grid gap-2',
          columns === 2 ? 'sm:grid-cols-2' : 'grid-cols-3',
        )}
      >
        {options.map((option) => {
          const selected = value === option.value
          const Icon = option.icon
          return (
            <label
              key={option.value}
              className={cn(
                'relative flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-left transition-all duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-amber-500/60 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-charcoal-950 sm:flex-col sm:gap-2',
                selected
                  ? 'border-amber-500/55 bg-amber-500/18 text-cream-50 shadow-[0_0_24px_-12px_rgb(232_168_56_/_0.55)]'
                  : 'border-cream-200/10 bg-charcoal-950/40 text-cream-300 hover:border-amber-500/30 hover:bg-amber-500/8',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {Icon ? (
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-lg',
                    selected
                      ? 'bg-amber-500/30 text-amber-300'
                      : 'bg-charcoal-700/80 text-cream-400',
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </span>
              ) : null}
              <span className="min-w-0">
                <span
                  className={cn(
                    'block font-medium',
                    Icon ? 'text-sm' : 'font-display text-xl font-semibold tabular-nums',
                  )}
                >
                  {option.label}
                </span>
                {option.hint ? (
                  <span className="mt-0.5 block text-[11px] leading-snug text-cream-500">
                    {option.hint}
                  </span>
                ) : null}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
