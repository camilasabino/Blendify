import type { ReactNode } from 'react'
import { cn, focusRing } from '@/lib/utils'

type SegmentedOption<T extends string> = {
  value: T
  label: ReactNode
}

type SegmentedControlProps<T extends string> = {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
  size?: 'sm' | 'md'
  layout?: 'inline' | 'grid'
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  size = 'md',
  layout = 'inline',
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'rounded-xl border border-cream-200/10 bg-charcoal-900/70 p-1 shadow-[inset_0_1px_0_rgb(232_168_56_/_0.06)]',
        layout === 'grid' ? 'grid grid-cols-2 gap-1' : 'inline-flex items-center',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-lg font-medium transition-all duration-200',
              focusRing,
              size === 'sm'
                ? 'rounded-md px-2.5 py-1 text-xs font-semibold tracking-wide'
                : 'px-3 py-2.5 text-sm',
              selected
                ? 'bg-amber-500 text-charcoal-950 shadow-[0_8px_20px_-10px_rgb(232_168_56_/_0.7)]'
                : 'text-cream-300 hover:bg-charcoal-700/70 hover:text-cream-50',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
