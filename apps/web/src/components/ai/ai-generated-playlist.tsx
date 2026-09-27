import { useId, type RefObject } from 'react'
import { CircleCheck } from 'lucide-react'
import type { AiIntentSummary } from '@blendify/contracts'
import { LastFmAttribution } from '@/components/brand/lastfm-attribution'
import { SpotifyLogo } from '@/components/brand/spotify-mark'
import { GeneratedTrackList } from '@/components/playlist/generated-track-list'
import { guestArtwork } from '@/components/playlist/generation-result-helpers'
import { GuestCover } from '@/components/playlist/generation-result-panel'
import { Button } from '@/components/ui/button'
import type { AiGeneratedExecution } from '@/hooks/use-ai-session'
import { useT } from '@/i18n/use-t'
import { formatSongCount } from '@/lib/song-count'
import { formatListeningTime } from '@/lib/utils'
import { AiPlaylistTitle } from './ai-playlist-title'
import { AiUnmetConstraints } from './ai-unmet-constraints'

type AiGeneratedPlaylistProps = Readonly<{
  intent: AiIntentSummary
  result: AiGeneratedExecution
  title: string | null
  onTitleChange: (title: string | null) => void
  headingRef: RefObject<HTMLHeadingElement | null>
  onStartOver: () => void
}>

export function AiGeneratedPlaylist({
  intent,
  result,
  title,
  onTitleChange,
  headingRef,
  onStartOver,
}: AiGeneratedPlaylistProps) {
  const t = useT()
  const { playlist } = result
  const artwork = guestArtwork(playlist.coverArtwork)
  const titleId = useId()
  const meta = [
    formatSongCount(result.trackCount, t),
    result.durationMs > 0 ? formatListeningTime(result.durationMs) : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const hasUnmetDuration = result.unmetConstraints.some(
    (constraint) => constraint.type === 'duration',
  )
  const requestedDuration =
    intent.targetDurationMinutes !== null && !hasUnmetDuration
      ? t('ai.result.durationRequested', { minutes: intent.targetDurationMinutes })
      : null

  return (
    <section
      aria-labelledby={titleId}
      className="animate-fade-up space-y-5 rounded-panel border border-accent-line/50 bg-panel bg-linear-to-br from-amber-500/[0.12] to-transparent to-60% p-5 shadow-[0_24px_60px_-36px_rgb(0_0_0_/_0.95)] sm:p-6"
    >
      <div className="flex items-start gap-4">
        <GuestCover artwork={artwork} />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="flex items-center gap-1.5 text-eyebrow text-accent-fg">
            <CircleCheck aria-hidden className="size-3.5" />
            {t('ai.result.eyebrow')}
          </p>
          <AiPlaylistTitle
            titleId={titleId}
            title={title}
            suggestedTitle={playlist.name}
            onTitleChange={onTitleChange}
            headingRef={headingRef}
          >
            <p className="text-sm text-cream-300">
              {meta}
              {requestedDuration ? (
                <span className="text-cream-400"> · {requestedDuration}</span>
              ) : null}
            </p>
          </AiPlaylistTitle>
        </div>
      </div>

      <AiUnmetConstraints constraints={result.unmetConstraints} />

      <div className="space-y-2">
        <p className="text-sm text-cream-300">{t('ai.result.previewNote')}</p>
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-cream-400">
          <span>
            {artwork ? t('guestResult.attributionWithArtwork') : t('guestResult.attribution')}
          </span>
          <SpotifyLogo />
        </p>
      </div>

      <GeneratedTrackList tracks={playlist.tracks} />

      <div className="flex flex-wrap gap-2 border-t border-divider pt-4">
        <Button type="button" variant="ghost" size="sm" onClick={onStartOver}>
          {t('ai.startOver')}
        </Button>
      </div>
      <LastFmAttribution />
    </section>
  )
}
