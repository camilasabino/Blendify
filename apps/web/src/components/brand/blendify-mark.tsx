import { cn } from '@/lib/utils'

type BlendifyMarkProps = Readonly<{
  className?: string
  title?: string
  decorative?: boolean
}>

export function BlendifyMark({
  className,
  title = 'Blendify',
  decorative = false,
}: BlendifyMarkProps) {
  return (
    <img
      src="/blendify-logo.svg"
      alt={decorative ? '' : title}
      aria-hidden={decorative || undefined}
      className={cn('size-9 shrink-0 object-contain', className)}
    />
  )
}
