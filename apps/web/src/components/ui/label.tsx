import type { LabelHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement>

export function Label({ className, htmlFor, ...props }: Readonly<LabelProps>) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        'text-sm font-medium text-cream-200 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className,
      )}
      {...props}
    />
  )
}
