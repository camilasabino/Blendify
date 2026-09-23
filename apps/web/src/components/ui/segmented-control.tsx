import { useId, type ReactNode } from 'react'
import { cn, focusWithinRing } from '@/lib/utils'

type SegmentedOption<T extends string> = Readonly<{
  value: T
  label: ReactNode
}>

type SegmentedControlProps<T extends string> = Readonly<{
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
  size?: 'sm' | 'md'
  layout?: 'inline' | 'grid'
}>

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = 'md',
  layout = 'inline',
}: SegmentedControlProps<T>) {
  const name = useId()

  return (
    <fieldset className={cn('min-w-0', className)}>
      <legend className="sr-only">{label}</legend>
      <div
        className={cn(
          'rounded-card border border-control bg-field p-1',
          layout === 'grid'
            ? 'grid grid-cols-2 gap-1'
            : 'inline-flex items-center',
        )}
      >
        {options.map((option) => {
          const selected = option.value === value
          return (
            <label
              key={option.value}
              className={cn(
                'cursor-pointer rounded-control border text-center font-medium transition-colors duration-200',
                focusWithinRing,
                'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
                size === 'sm'
                  ? 'px-2.5 py-1 text-xs font-semibold tracking-wide'
                  : 'px-3 py-2 text-sm',
                selected
                  ? 'border-accent-line bg-accent-soft text-accent-fg'
                  : 'border-transparent text-cream-300 hover:bg-hover hover:text-cream-50',
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
              {option.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
