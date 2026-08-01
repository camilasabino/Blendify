import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-charcoal-950 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        default:
          'bg-amber-500 text-charcoal-950 hover:bg-amber-400 shadow-[0_0_0_0_transparent] hover:shadow-[0_8px_24px_-8px_rgb(232_168_56_/_0.55)]',
        secondary:
          'bg-charcoal-700 text-cream-100 hover:bg-charcoal-600 border border-charcoal-600',
        outline:
          'border border-cream-200/20 bg-transparent text-cream-100 hover:border-amber-500/50 hover:bg-amber-500/10',
        ghost: 'text-cream-200 hover:bg-charcoal-700 hover:text-cream-50',
        danger:
          'bg-red-950/60 text-red-200 border border-red-900/60 hover:bg-red-900/50',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-12 rounded-xl px-6 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
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
