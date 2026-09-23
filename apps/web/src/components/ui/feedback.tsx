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
        'rounded-panel border border-dashed border-control px-6 py-12 text-center',
        className,
      )}
    >
      <h2 className="font-display text-lg font-semibold text-cream-50">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-cream-400">{body}</p>
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
        'space-y-3 rounded-card border border-danger-line bg-danger-soft p-4',
        className,
      )}
    >
      <p className="text-sm text-danger">{message}</p>
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
  return <p className={cn('text-sm text-danger', className)}>{children}</p>
}

export { LoadingState } from '@/components/ui/spinner'

