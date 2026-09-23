import { useId, type ReactNode } from 'react'
import { Check, type LucideIcon } from 'lucide-react'
import { cn, focusWithinRing } from '@/lib/utils'

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
  mobileLayout = 'stack',
}: Readonly<{
  label: string
  value: T
  options: readonly RadioCardOption<T>[]
  onChange: (value: T) => void
  mobileLayout?: 'stack' | 'inline'
}>) {
  const name = useId()
  const stacked = mobileLayout === 'stack'

  return (
    <fieldset>
      <legend className="sr-only">{label}</legend>
      <div
        className={cn(
          'grid gap-2',
          stacked ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-3',
        )}
      >
        {options.map((option) => {
          const selected = value === option.value
          const Icon = option.icon
          return (
            <label
              key={option.value}
              className={cn(
                'relative flex min-h-11 cursor-pointer rounded-card border px-3 py-3 text-left transition-colors duration-150',
                stacked
                  ? 'items-center gap-3 pr-9 sm:flex-col sm:items-start sm:gap-2 sm:pr-3'
                  : 'flex-col gap-0.5',
                focusWithinRing,
                'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
                selected
                  ? 'border-accent-line bg-accent-soft text-cream-50'
                  : 'border-control bg-field text-cream-200 hover:border-control-hover hover:bg-hover hover:text-cream-50',
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
                    'flex size-8 shrink-0 items-center justify-center rounded-control',
                    selected
                      ? 'bg-accent-soft text-accent-fg'
                      : 'bg-charcoal-700 text-cream-400',
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </span>
              ) : null}
              <span className="min-w-0">
                <span
                  className={cn(
                    'block',
                    Icon
                      ? 'text-sm font-medium'
                      : 'font-display text-xl font-semibold tabular-nums',
                  )}
                >
                  {option.label}
                </span>
                {option.hint ? (
                  <span
                    className={cn(
                      'mt-0.5 block text-xs leading-snug',
                      selected ? 'text-cream-300' : 'text-cream-400',
                    )}
                  >
                    {option.hint}
                  </span>
                ) : null}
              </span>
              {selected ? (
                <Check
                  aria-hidden
                  className={cn(
                    'absolute right-3 size-4 text-accent-fg',
                    stacked
                      ? 'top-1/2 -translate-y-1/2 sm:top-3 sm:translate-y-0'
                      : 'top-3',
                  )}
                />
              ) : null}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
