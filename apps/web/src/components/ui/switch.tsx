import type { ButtonHTMLAttributes } from 'react'
import { cn, focusRing } from '@/lib/utils'

export type SwitchProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange'
> & {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

export function Switch({
  checked,
  onCheckedChange,
  className,
  disabled,
  id,
  ...props
}: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200',
        focusRing,
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked
          ? 'border-accent bg-accent'
          : 'border-control bg-charcoal-700 hover:border-control-hover',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'pointer-events-none block size-4 rounded-full shadow transition-transform duration-200',
          checked ? 'translate-x-6 bg-on-accent' : 'translate-x-1 bg-cream-200',
        )}
      />
    </button>
  )
}
