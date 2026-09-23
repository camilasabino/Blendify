import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

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
          'rounded-xl border border-cream-200/10 bg-charcoal-900/70 p-1 shadow-[inset_0_1px_0_rgb(232_168_56_/_0.06)]',
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
                'cursor-pointer rounded-lg text-center font-medium transition-all duration-200',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-amber-500/60 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-charcoal-950',
                'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60',
                size === 'sm'
                  ? 'rounded-md px-2.5 py-1 text-xs font-semibold tracking-wide'
                  : 'px-3 py-2.5 text-sm',
                selected
                  ? 'bg-amber-500 text-charcoal-950 shadow-[0_8px_20px_-10px_rgb(232_168_56_/_0.7)]'
                  : 'text-cream-300 hover:bg-charcoal-700/70 hover:text-cream-50',
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
