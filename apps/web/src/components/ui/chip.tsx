import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn, focusRing } from '@/lib/utils'

type SelectableChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean
  children: ReactNode
}

export function SelectableChip({
  selected,
  className,
  children,
  ...props
}: SelectableChipProps) {
  return (
    <button
      type="button"
      className={cn(
        'min-h-8 cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors duration-150',
        focusRing,
        selected
          ? 'border-accent-line bg-accent-soft text-cream-50'
          : 'border-divider bg-card text-cream-200 hover:border-control-hover hover:bg-hover hover:text-cream-50',
        props.disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

type RemovableChipProps = Readonly<{
  label: string
  onRemove: () => void
  removeLabel: string
  imageUrl?: string | null
  leading?: ReactNode
  highlighted?: boolean
  className?: string
}>

export function RemovableChip({
  label,
  onRemove,
  removeLabel,
  imageUrl,
  leading,
  highlighted,
  className,
}: RemovableChipProps) {
  return (
    <li
      className={cn(
        'animate-chip-in inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-2 text-sm text-cream-50',
        highlighted
          ? 'border-accent-line bg-accent-soft'
          : 'border-divider bg-card',
        className,
      )}
    >
      {leading}
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="size-6 rounded-full object-cover"
        />
      ) : null}
      {!imageUrl && !leading ? (
        <span className="flex size-6 items-center justify-center rounded-full bg-charcoal-600 text-xs">
          {label.slice(0, 1)}
        </span>
      ) : null}
      <span className="max-w-40 truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className={cn(
          '-my-0.5 -mr-1 flex size-6 shrink-0 items-center justify-center rounded-full text-cream-400 transition-colors hover:bg-hover hover:text-cream-50 disabled:pointer-events-none disabled:opacity-50',
          focusRing,
        )}
        aria-label={removeLabel}
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </li>
  )
}

type SeedChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean
  children: ReactNode
}

export function SeedChip({
  active,
  className,
  children,
  ...props
}: SeedChipProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-6 items-center rounded-full border px-2.5 py-0.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        focusRing,
        active
          ? 'border-accent-line bg-accent-soft text-accent-fg'
          : 'border-divider bg-card text-cream-300 hover:border-control-hover hover:text-cream-50',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function ClearAllButton({
  onClick,
  children,
}: Readonly<{
  onClick: () => void
  children: ReactNode
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex min-h-6 items-center rounded-control px-1.5 text-xs text-cream-400 transition-colors hover:text-cream-50 disabled:pointer-events-none disabled:opacity-50',
        focusRing,
      )}
    >
      {children}
    </button>
  )
}
