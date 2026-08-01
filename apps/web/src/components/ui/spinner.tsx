import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const sizes = {
  sm: 'size-3.5',
  md: 'size-4',
  lg: 'size-8',
} as const

type SpinnerProps = Readonly<{
  className?: string
  size?: keyof typeof sizes
}>

export function Spinner({ className, size = 'md' }: SpinnerProps) {
  return (
    <Loader2
      className={cn('animate-spin text-amber-500', sizes[size], className)}
      aria-hidden
    />
  )
}

type LoadingStateProps = Readonly<{
  label: string
  className?: string
}>

export function LoadingState({ label, className }: LoadingStateProps) {
  return (
    <output
      className={cn('flex items-center gap-2 text-cream-400', className)}
    >
      <Spinner />
      {label}
    </output>
  )
}
