import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type PageContainerProps = Readonly<{
  width?: 'form' | 'wide'
  className?: string
  children: ReactNode
}>

export function PageContainer({
  width = 'wide',
  className,
  children,
}: PageContainerProps) {
  return (
    <div
      className={cn(
        'w-full min-w-0 space-y-8 animate-fade-up',
        width === 'form' && 'max-w-3xl',
        className,
      )}
    >
      {children}
    </div>
  )
}
