import type { TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export function Textarea({ className, ...props }: Readonly<TextareaProps>) {
  return (
    <textarea
      className={cn(
        'flex min-h-25 w-full resize-y rounded-control border border-control bg-field px-3 py-2 text-sm text-cream-50 placeholder:text-cream-500 transition-colors duration-200 hover:border-control-hover',
        'focus-visible:border-accent-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-control',
        className,
      )}
      {...props}
    />
  )
}
