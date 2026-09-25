import type { KeyboardEvent, MouseEvent } from 'react'
import { SpotifyIcon } from '@/components/brand/spotify-mark'
import { cn, focusRing, toSpotifyUrl } from '@/lib/utils'

type SpotifyLinkProps = Readonly<{
  href: string | null | undefined
  label: string
  className?: string
}>

export function SpotifyLink({ href, label, className }: SpotifyLinkProps) {
  const url = toSpotifyUrl(href)
  if (!url) return null
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      onClick={(event: MouseEvent) => event.stopPropagation()}
      onMouseDown={(event: MouseEvent) => event.stopPropagation()}
      onKeyDown={(event: KeyboardEvent) => event.stopPropagation()}
      className={cn(
        'inline-flex size-[43px] shrink-0 items-center justify-center rounded-control opacity-90 transition-opacity hover:opacity-100',
        focusRing,
        className,
      )}
    >
      <SpotifyIcon />
    </a>
  )
}
