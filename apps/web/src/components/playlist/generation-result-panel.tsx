import { useId } from 'react'
import {
  Check,
  Copy,
  ExternalLink,
  Plus,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react'
import type {
  GenerationProgress,
  PlaylistDetail,
} from '@blendify/contracts'
import { CoverErrorNotice } from '@/components/playlist/generation-form-shared'
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

function progressAnnouncement(
  progress: GenerationProgress | null,
  workingHintKey: MessageKey,
  t: ReturnType<typeof useT>,
): string {
  if (!progress) return t(workingHintKey)
  const count = t('create.progressCount', {
    current: progress.current,
    total: progress.total,
  })
  return `${t(phaseMessageKey(progress.phase))}, ${count}`
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
          <span className="shrink-0 text-xs font-medium tabular-nums text-accent-fg">
            {percent}%
          </span>
        ) : null}
      </div>
      <GenerationProgressBar
        progress={progress}
        progressLabel={progressLabel}
      />
      {metaLine ? (
        <p className="text-xs text-cream-400">{metaLine}</p>
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
      <p className="mt-2 text-sm text-warning">
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
        <ExternalLink aria-hidden className="size-4" />
        {t('create.openSpotify')}
      </a>
      <Button type="button" variant="secondary" onClick={() => onCopy(spotifyUrl)}>
        {copied ? (
          <Check aria-hidden className="size-4" />
        ) : (
          <Copy aria-hidden className="size-4" />
        )}
        {copied ? t('create.copied') : t('create.copyLink')}
      </Button>
    </>
  )
}

function GenerationErrorState({
  message,
  onRetry,
}: Readonly<{
  message: string
  onRetry: () => void
}>) {
  const t = useT()
  return (
    <div className="space-y-4">
      <p role="alert" className="text-sm leading-relaxed text-danger">
        {message}
      </p>
      <Button type="button" variant="secondary" onClick={onRetry}>
        <RotateCcw aria-hidden className="size-4" />
        {t('common.retry')}
      </Button>
    </div>
  )
}

function NextStepActions({
  onAdjust,
  onCreateAnother,
}: Readonly<{
  onAdjust: () => void
  onCreateAnother: () => void
}>) {
  const t = useT()
  return (
    <div className="flex flex-wrap gap-2 border-t border-divider pt-4">
      <Button type="button" variant="secondary" size="sm" onClick={onCreateAnother}>
        <Plus aria-hidden className="size-3.5" />
        {t('create.createAnother')}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onAdjust}>
        <SlidersHorizontal aria-hidden className="size-3.5" />
        {t('create.adjustAndRecreate')}
      </Button>
    </div>
  )
}

function ReadyResult({
  result,
  requestedTrackCount,
  copied,
  onCopy,
  onAdjust,
  onCreateAnother,
}: Readonly<{
  result: PlaylistDetail
  requestedTrackCount: number
  copied: boolean
  onCopy: (url: string) => void
  onAdjust: () => void
  onCreateAnother: () => void
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
          <p className="text-base font-semibold text-cream-50">{result.name}</p>
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
        <NextStepActions
          onAdjust={onAdjust}
          onCreateAnother={onCreateAnother}
        />
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
  error,
  coverError,
  requestedTrackCount,
  workingTitleKey,
  workingHintKey,
  copied,
  onCopy,
  onRetry,
  onAdjust,
  onCreateAnother,
}: Readonly<{
  isGenerating: boolean
  result: PlaylistDetail | null
  progress: GenerationProgress | null
  error: string | null
  coverError: string | null
  requestedTrackCount: number
  workingTitleKey: MessageKey
  workingHintKey: MessageKey
  copied: boolean
  onCopy: (url: string) => void
  onRetry: () => void
  onAdjust: () => void
  onCreateAnother: () => void
}>) {
  const t = useT()
  const titleId = useId()

  if (!isGenerating && !result && !error) return null

  const showError = !isGenerating && error != null
  const showResult = !isGenerating && !showError && result != null
  let title = t('create.ready')
  if (isGenerating) title = t(workingTitleKey)
  else if (showError) title = t('create.failedTitle')

  let announcement = ''
  if (isGenerating) {
    announcement = progressAnnouncement(progress, workingHintKey, t)
  } else if (showResult) {
    announcement = `${t('create.ready')}. ${t('create.tracksReady', { count: result.trackCount })}`
  }

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        'animate-fade-up space-y-4 rounded-panel border bg-panel bg-linear-to-br to-transparent to-60% p-5 shadow-[0_24px_60px_-36px_rgb(0_0_0_/_0.95)] sm:p-6',
        showError
          ? 'border-danger-line from-danger-soft'
          : 'border-accent-line/50 from-amber-500/[0.12]',
      )}
    >
      <h2
        id={titleId}
        className="font-display text-lg font-semibold text-cream-50"
      >
        {title}
      </h2>
      <output className="sr-only">{announcement}</output>
      {isGenerating ? (
        <GeneratingState
          progress={progress}
          workingHintKey={workingHintKey}
        />
      ) : null}
      {showError ? (
        <GenerationErrorState message={error} onRetry={onRetry} />
      ) : null}
      <CoverErrorNotice message={coverError} />
      {showResult ? (
        <ReadyResult
          result={result}
          requestedTrackCount={requestedTrackCount}
          copied={copied}
          onCopy={onCopy}
          onAdjust={onAdjust}
          onCreateAnother={onCreateAnother}
        />
      ) : null}
    </section>
  )
}
