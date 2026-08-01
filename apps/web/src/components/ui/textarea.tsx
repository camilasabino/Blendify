import type { TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export function Textarea({ className, ...props }: Readonly<TextareaProps>) {
  return (
    <textarea
      className={cn(
        'flex min-h-[100px] w-full rounded-lg border border-cream-200/15 bg-charcoal-800/80 px-3 py-2 text-sm text-cream-50 placeholder:text-cream-400/60 transition-colors duration-200 resize-y',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:border-amber-500/40',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
