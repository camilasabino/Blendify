import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-control text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        default:
          'bg-accent text-on-accent hover:bg-accent-hover shadow-[0_0_0_0_transparent] hover:shadow-[0_8px_24px_-8px_rgb(232_168_56_/_0.55)]',
        secondary:
          'border border-charcoal-600 bg-charcoal-700 text-cream-100 hover:border-control hover:bg-charcoal-600',
        outline:
          'border border-control bg-transparent text-cream-100 hover:border-control-hover hover:bg-hover',
        ghost: 'text-cream-200 hover:bg-hover hover:text-cream-50',
        danger:
          'border border-danger-line bg-danger-soft text-danger hover:border-danger',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-12 px-6 text-base',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean
  }

export function Button({
  className,
  variant,
  size,
  type = 'button',
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading ? <Spinner size="sm" className="text-current" /> : null}
      {children}
    </button>
  )
}
