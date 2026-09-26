import { useT } from '@/i18n/use-t'
import { LASTFM_URL } from '@/lib/lastfm'
import { cn, focusRing } from '@/lib/utils'

type LastFmAttributionProps = Readonly<{
  href?: string
  className?: string
}>

export function LastFmAttribution({
  href = LASTFM_URL,
  className,
}: LastFmAttributionProps) {
  const t = useT()
  return (
    <p className={cn('text-xs text-cream-400', className)}>
      {t('attribution.lastfm')}{' '}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'rounded-control underline underline-offset-4 transition-colors hover:text-accent-fg',
          focusRing,
        )}
      >
        Last.fm
        <span className="sr-only"> {t('common.opensNewTab')}</span>
      </a>
    </p>
  )
}
