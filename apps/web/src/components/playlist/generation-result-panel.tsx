import { Check, Copy, ExternalLink } from 'lucide-react'
import type {
  GenerationProgress,
  PlaylistDetail,
} from '@blendify/contracts'
import { PlaylistPreview } from '@/components/playlist/playlist-preview'
import { Button, buttonVariants } from '@/components/ui/button'
import { useGenerationFill } from '@/hooks/use-generation-feedback'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { cn } from '@/lib/utils'

function phaseMessageKey(phase: GenerationProgress['phase']): MessageKey {
  switch (phase) {
    case 'resolving_seeds':
      return 'create.progressResolving'
    case 'matching_tracks':
      return 'create.progressMatching'
    case 'publishing':
      return 'create.progressPublishing'
  }
}

function etaMessage(
  seconds: number | null | undefined,
  t: ReturnType<typeof useT>,
): string | null {
  if (seconds == null || seconds <= 0) return null
  if (seconds < 60) return t('create.etaLessThanMinute')

  const minutes = Math.max(1, Math.ceil(seconds / 60))
  return minutes === 1
    ? t('create.etaOneMinute')
    : t('create.etaMinutes', { minutes })
}

function GenerationProgressBar({
  progress,
  progressLabel,
}: Readonly<{
  progress: GenerationProgress | null
  progressLabel: string
}>) {
  const percent = progress?.percent ?? 0
  return (
    <progress
      className={cn(
        'generation-progress h-1.5 w-full overflow-hidden rounded-full',
        !progress && 'generation-progress--indeterminate',
      )}
      max={100}
      value={progress ? percent : undefined}
      aria-label={progressLabel}
    />
  )
}

function GeneratingState({
  progress,
  workingHintKey,
}: Readonly<{
  progress: GenerationProgress | null
  workingHintKey: MessageKey
}>) {
  const t = useT()
  const percent = progress?.percent ?? 0
  const progressLabel = progress
    ? t(phaseMessageKey(progress.phase))
    : t(workingHintKey)
  const progressCount = progress
    ? t('create.progressCount', {
        current: progress.current,
        total: progress.total,
      })
    : null
  const etaLabel = etaMessage(progress?.etaSeconds, t)
  const metaLine = [progressCount, etaLabel].filter(Boolean).join(' · ')

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm font-medium text-cream-200">{progressLabel}</p>
        {progress ? (
          <span className="shrink-0 text-xs tabular-nums text-amber-300">
            {percent}%
          </span>
        ) : null}
      </div>
      <GenerationProgressBar
        progress={progress}
        progressLabel={progressLabel}
      />
      {metaLine ? (
        <p className="text-xs text-cream-500">{metaLine}</p>
      ) : null}
    </div>
  )
}

function FillStatusMessages({
  trackCount,
  requestedTrackCount,
  isNearCompleteFill,
  isShortFill,
}: Readonly<{
  trackCount: number
  requestedTrackCount: number
  isNearCompleteFill: boolean
  isShortFill: boolean
}>) {
  const t = useT()
  if (isNearCompleteFill) {
    return (
      <p className="mt-2 text-sm text-cream-300">
        {t('create.nearCompleteTracks', {
          count: trackCount,
          requested: requestedTrackCount,
        })}
      </p>
    )
  }
  if (isShortFill) {
    return (
      <p className="mt-2 text-sm text-amber-200/90">
        {t('create.partialTracks', {
          count: trackCount,
          requested: requestedTrackCount,
        })}
      </p>
    )
  }
  return null
}

function ResultActions({
  spotifyUrl,
  copied,
  onCopy,
}: Readonly<{
  spotifyUrl: string | null | undefined
  copied: boolean
  onCopy: (url: string) => void
}>) {
  const t = useT()
  if (!spotifyUrl) {
    return <p className="text-sm text-cream-400">{t('create.linkPending')}</p>
  }
  return (
    <>
      <a
        href={spotifyUrl}
        target="_blank"
        rel="noreferrer"
        className={cn(buttonVariants())}
      >
        <ExternalLink className="size-4" />
        {t('create.openSpotify')}
      </a>
      <Button type="button" variant="secondary" onClick={() => onCopy(spotifyUrl)}>
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? t('create.copied') : t('create.copyLink')}
      </Button>
    </>
  )
}

function ReadyResult({
  result,
  requestedTrackCount,
  copied,
  onCopy,
}: Readonly<{
  result: PlaylistDetail
  requestedTrackCount: number
  copied: boolean
  onCopy: (url: string) => void
}>) {
  const t = useT()
  const { isNearCompleteFill, isShortFill } = useGenerationFill(
    result,
    requestedTrackCount,
  )

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <p className="font-medium text-cream-50">{result.name}</p>
          <p className="mt-1 text-sm text-cream-400">
            {t('create.tracksReady', { count: result.trackCount })}
          </p>
          <FillStatusMessages
            trackCount={result.trackCount}
            requestedTrackCount={requestedTrackCount}
            isNearCompleteFill={isNearCompleteFill}
            isShortFill={isShortFill}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <ResultActions
            spotifyUrl={result.spotifyUrl}
            copied={copied}
            onCopy={onCopy}
          />
        </div>
      </div>
      <PlaylistPreview
        mode="full"
        tracks={result.tracks}
        spotifyId={result.spotifyId}
        spotifyUrl={result.spotifyUrl}
      />
    </div>
  )
}

export function GenerationResultPanel({
  isGenerating,
  result,
  progress,
  requestedTrackCount,
  workingTitleKey,
  workingHintKey,
  copied,
  onCopy,
}: Readonly<{
  isGenerating: boolean
  result: PlaylistDetail | null
  progress: GenerationProgress | null
  requestedTrackCount: number
  workingTitleKey: MessageKey
  workingHintKey: MessageKey
  copied: boolean
  onCopy: (url: string) => void
}>) {
  const t = useT()

  if (!isGenerating && !result) return null

  return (
    <section
      className="animate-fade-up relative overflow-hidden space-y-4 rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 via-charcoal-800/80 to-charcoal-950 p-5 shadow-[0_24px_60px_-36px_rgb(0_0_0_/_0.95)] sm:p-6"
      aria-live="polite"
      aria-busy={isGenerating}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-amber-500/20 blur-3xl"
      />
      <h2 className="relative font-display text-lg font-semibold text-cream-50">
        {isGenerating ? t(workingTitleKey) : t('create.ready')}
      </h2>
      {isGenerating ? (
        <GeneratingState
          progress={progress}
          workingHintKey={workingHintKey}
        />
      ) : null}
      {result && !isGenerating ? (
        <ReadyResult
          result={result}
          requestedTrackCount={requestedTrackCount}
          copied={copied}
          onCopy={onCopy}
        />
      ) : null}
    </section>
  )
}
