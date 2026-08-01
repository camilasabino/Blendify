import { cn } from '@/lib/utils'

type BlendifyMarkProps = Readonly<{
  className?: string
  title?: string
}>

export function BlendifyMark({
  className,
  title = 'Blendify',
}: BlendifyMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="none"
      className={cn('size-7 shrink-0', className)}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <rect width="32" height="32" rx="8" fill="#14110e" />
      <circle cx="12.5" cy="16" r="8.25" fill="#d97706" />
      <circle
        cx="19.5"
        cy="16"
        r="8.25"
        fill="#f59e0b"
        fillOpacity="0.92"
      />
      <circle cx="16" cy="16" r="3.1" fill="#14110e" />
      <circle cx="16" cy="16" r="1.15" fill="#fde68a" />
    </svg>
  )
}
