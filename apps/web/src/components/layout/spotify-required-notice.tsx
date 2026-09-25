import { Lock, X } from 'lucide-react'
import { ConnectSpotifyButton } from '@/components/layout/connect-spotify-button'
import type { SpotifyOnlyFeature } from '@/lib/spotify-required'
import { useT } from '@/i18n/use-t'
import { cn, focusRing } from '@/lib/utils'

export function SpotifyRequiredNotice({
  feature,
  onDismiss,
}: Readonly<{
  feature: SpotifyOnlyFeature
  onDismiss: () => void
}>) {
  const t = useT()
  const message =
    feature === 'library'
      ? t('spotifyRequired.library')
      : t('spotifyRequired.stats')

  return (
    <div
      role="status"
      className="mb-6 flex max-w-3xl flex-wrap items-center gap-3 rounded-card border border-divider bg-card px-4 py-3"
    >
      <Lock aria-hidden className="size-4 shrink-0 text-accent-fg" />
      <p className="min-w-0 flex-1 text-sm text-cream-200">{message}</p>
      <div className="flex items-center gap-1">
        <ConnectSpotifyButton variant="secondary" />
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('spotifyRequired.dismiss')}
          title={t('spotifyRequired.dismiss')}
          className={cn(
            'inline-flex size-8 items-center justify-center rounded-control text-cream-400 transition-colors hover:bg-hover hover:text-cream-50',
            focusRing,
          )}
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  )
}
