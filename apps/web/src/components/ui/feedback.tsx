import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type EmptyStateProps = Readonly<{
  title: string
  body: string
  action?: { to: string; label: string }
  className?: string
}>

export function EmptyState({ title, body, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-dashed border-cream-200/15 px-6 py-12 text-center',
        className,
      )}
    >
      <h2 className="font-display text-lg text-cream-100">{title}</h2>
      <p className="mt-2 text-sm text-cream-400">{body}</p>
      {action ? (
        <Link to={action.to} className={cn(buttonVariants({ className: 'mt-5' }))}>
          {action.label}
        </Link>
      ) : null}
    </div>
  )
}

type ErrorStateProps = Readonly<{
  message: string
  retryLabel?: string
  onRetry?: () => void
  className?: string
  children?: ReactNode
}>

export function ErrorState({
  message,
  retryLabel,
  onRetry,
  className,
  children,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'space-y-3 rounded-xl border border-red-900/40 bg-red-950/20 p-4',
        className,
      )}
    >
      <p className="text-sm text-red-200">{message}</p>
      {children}
      {onRetry && retryLabel ? (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  )
}

export function FieldError({
  children,
  className,
}: Readonly<{
  children: ReactNode
  className?: string
}>) {
  if (!children) return null
  return <p className={cn('text-sm text-red-300', className)}>{children}</p>
}

export { LoadingState } from '@/components/ui/spinner'

