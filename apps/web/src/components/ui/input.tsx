import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type InputProps = InputHTMLAttributes<HTMLInputElement>

export function Input({ className, type = 'text', ...props }: Readonly<InputProps>) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-control border border-control bg-field px-3 py-2 text-sm text-cream-50 placeholder:text-cream-500 transition-colors duration-200 hover:border-control-hover',
        'focus-visible:border-accent-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-control',
        className,
      )}
      {...props}
    />
  )
}
