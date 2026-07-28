import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { cn, focusRing } from '@/lib/utils'

type SearchFieldProps = {
  value: string
  onChange: (value: string) => void
  placeholder: string
  clearLabel?: string
  loading?: boolean
  className?: string
  inputClassName?: string
  'aria-label'?: string
}

export function SearchField({
  value,
  onChange,
  placeholder,
  clearLabel,
  loading,
  className,
  inputClassName,
  'aria-label': ariaLabel,
}: SearchFieldProps) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-cream-500" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'pl-9',
          (value || loading) && 'pr-9',
          inputClassName,
        )}
        aria-label={ariaLabel ?? placeholder}
      />
      {loading ? (
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
          <Spinner size="sm" />
        </span>
      ) : value && clearLabel ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className={cn(
            'absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-cream-400 transition-colors hover:bg-charcoal-700 hover:text-cream-100',
            focusRing,
          )}
          aria-label={clearLabel}
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  )
}
