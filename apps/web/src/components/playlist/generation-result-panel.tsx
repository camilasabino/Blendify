import { useId } from 'react'
import {
  Blend,
  Check,
  CircleCheck,
  Clock,
  Copy,
  ExternalLink,
  Plus,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react'
import type {
  GeneratedPlaylistDto,
  GenerationProgress,
  PlaylistDetail,
} from '@blendify/contracts'
import { SpotifyLogo } from '@/components/brand/spotify-mark'
import { CoverErrorNotice } from '@/components/playlist/generation-form-shared'
import { GeneratedTrackList } from '@/components/playlist/generated-track-list'
import { PlaylistPreview } from '@/components/playlist/playlist-preview'
import { TransferAction } from '@/components/playlist/transfer-action'
import { Button, buttonVariants } from '@/components/ui/button'
import { useGenerationFill } from '@/hooks/use-generation-feedback'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import type { AppMode } from '@/lib/capabilities'
import { readPersistToLibraryPreference } from '@/lib/persist-to-library-preference'
import {
  outcomeDurationMs,
  outcomeTrackCount,
  type GenerationOutcome,
} from '@/lib/playlist-generation'
import { formatSongCount } from '@/lib/song-count'
import {
  cn,
  focusRing,
  formatListeningTime,
  toSafeHttpsUrl,
  toSpotifyUrl,
} from '@/lib/utils'

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

function readyKey(mode: AppMode): MessageKey {
  return mode === 'guest' ? 'create.readyGuest' : 'create.ready'
}

function failedTitleKey(mode: AppMode): MessageKey {
  return mode === 'guest' ? 'create.failedTitleGuest' : 'create.failedTitle'
}

function leaveNoteKey(mode: AppMode): MessageKey {
  if (mode === 'guest') return 'create.leaveNoteGuest'
  return readPersistToLibraryPreference()
    ? 'create.leaveNoteLibrary'
    : 'create.leaveNoteSpotify'
}

function GeneratingState({
  mode,
  progress,
  workingHintKey,
  requestStarted,
}: Readonly<{
  mode: AppMode
  progress: GenerationProgress | null
  workingHintKey: MessageKey
  requestStarted: boolean
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
      {requestStarted ? (
        <p className="text-xs leading-relaxed text-cream-400">
          {t(leaveNoteKey(mode))}
        </p>
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

function resultMeta(
  result: GenerationOutcome,
  t: ReturnType<typeof useT>,
): string {
  const durationMs = outcomeDurationMs(result)
  return [
    formatSongCount(outcomeTrackCount(result), t),
    durationMs > 0 ? formatListeningTime(durationMs) : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function ReadyResult({
  outcome,
  result,
  requestedTrackCount,
  copied,
  onCopy,
  onAdjust,
  onCreateAnother,
}: Readonly<{
  outcome: GenerationOutcome
  result: PlaylistDetail
  requestedTrackCount: number
  copied: boolean
  onCopy: (url: string) => void
  onAdjust: () => void
  onCreateAnother: () => void
}>) {
  const t = useT()
  const { isNearCompleteFill, isShortFill } = useGenerationFill(
    result.trackCount,
    requestedTrackCount,
  )

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <p className="text-sm text-cream-300">{resultMeta(outcome, t)}</p>
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

type GuestArtwork = Readonly<{ imageUrl: string; spotifyUrl: string }>

function guestArtwork(
  artwork: GeneratedPlaylistDto['coverArtwork'],
): GuestArtwork | null {
  const imageUrl = toSafeHttpsUrl(artwork?.imageUrl)
  const spotifyUrl = toSpotifyUrl(artwork?.spotifyUrl)
  return imageUrl && spotifyUrl ? { imageUrl, spotifyUrl } : null
}

function GuestCover({ artwork }: Readonly<{ artwork: GuestArtwork | null }>) {
  const t = useT()
  if (artwork) {
    return (
      <a
        href={artwork.spotifyUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('guestResult.openArtworkInSpotify')}
        title={t('guestResult.openArtworkInSpotify')}
        className={cn('shrink-0 rounded-control', focusRing)}
      >
        <img
          src={artwork.imageUrl}
          alt=""
          className="size-20 rounded-control object-cover ring-1 ring-divider sm:size-24"
        />
      </a>
    )
  }
  return (
    <span className="flex size-20 shrink-0 items-center justify-center rounded-card bg-linear-to-br from-amber-400 to-amber-700 text-on-accent sm:size-24">
      <Blend aria-hidden className="size-7" />
    </span>
  )
}

function GuestReadyResult({
  outcome,
  playlist,
  requestedTrackCount,
  onRegenerate,
  onAdjust,
  onCreateAnother,
}: Readonly<{
  outcome: GenerationOutcome
  playlist: GeneratedPlaylistDto
  requestedTrackCount: number
  onRegenerate: () => void
  onAdjust: () => void
  onCreateAnother: () => void
}>) {
  const t = useT()
  const trackCount = playlist.tracks.length
  const { isNearCompleteFill, isShortFill } = useGenerationFill(
    trackCount,
    requestedTrackCount,
  )
  const artwork = guestArtwork(playlist.coverArtwork)

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-start gap-4">
          <GuestCover artwork={artwork} />
          <div className="min-w-0 space-y-2">
            {playlist.description ? (
              <p className="break-words text-sm text-cream-200">
                {playlist.description}
              </p>
            ) : null}
            <p className="text-sm text-cream-300">{resultMeta(outcome, t)}</p>
            <FillStatusMessages
              trackCount={trackCount}
              requestedTrackCount={requestedTrackCount}
              isNearCompleteFill={isNearCompleteFill}
              isShortFill={isShortFill}
            />
            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-cream-400">
              <span>
                {artwork
                  ? t('guestResult.attributionWithArtwork')
                  : t('guestResult.attribution')}
              </span>
              <SpotifyLogo />
            </p>
          </div>
        </div>
        <p className="flex items-start gap-2 text-sm leading-relaxed text-cream-300">
          <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-cream-400" />
          {t('guestResult.temporary')}
        </p>
        {playlist.transfer ? (
          <TransferAction
            key={playlist.transfer.token}
            offer={playlist.transfer}
            onRegenerate={onRegenerate}
          />
        ) : null}
        <NextStepActions
          onAdjust={onAdjust}
          onCreateAnother={onCreateAnother}
        />
      </div>
      <GeneratedTrackList tracks={playlist.tracks} />
    </div>
  )
}

function ResultBody({
  outcome,
  requestedTrackCount,
  copied,
  onCopy,
  onRetry,
  onAdjust,
  onCreateAnother,
}: Readonly<{
  outcome: GenerationOutcome
  requestedTrackCount: number
  copied: boolean
  onCopy: (url: string) => void
  onRetry: () => void
  onAdjust: () => void
  onCreateAnother: () => void
}>) {
  if (outcome.mode === 'guest') {
    return (
      <GuestReadyResult
        outcome={outcome}
        playlist={outcome.playlist}
        requestedTrackCount={requestedTrackCount}
        onRegenerate={onRetry}
        onAdjust={onAdjust}
        onCreateAnother={onCreateAnother}
      />
    )
  }
  return (
    <ReadyResult
      outcome={outcome}
      result={outcome.playlist}
      requestedTrackCount={requestedTrackCount}
      copied={copied}
      onCopy={onCopy}
      onAdjust={onAdjust}
      onCreateAnother={onCreateAnother}
    />
  )
}

export function GenerationResultPanel({
  mode,
  isGenerating,
  result,
  progress,
  error,
  coverError,
  requestedTrackCount,
  workingTitleKey,
  workingHintKey,
  requestStarted = false,
  copied,
  onCopy,
  onRetry,
  onAdjust,
  onCreateAnother,
}: Readonly<{
  mode: AppMode
  isGenerating: boolean
  result: GenerationOutcome | null
  progress: GenerationProgress | null
  error: string | null
  coverError: string | null
  requestedTrackCount: number
  workingTitleKey: MessageKey
  workingHintKey: MessageKey
  requestStarted?: boolean
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
  const readyLabel = t(readyKey(result?.mode ?? mode))
  let title = result?.playlist.name ?? readyLabel
  if (isGenerating) title = t(workingTitleKey)
  else if (showError) title = t(failedTitleKey(mode))

  let announcement = ''
  if (isGenerating) {
    announcement = progressAnnouncement(progress, workingHintKey, t)
  } else if (showResult) {
    announcement = `${readyLabel}: ${result.playlist.name}. ${resultMeta(result, t)}`
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
      <div className="space-y-1">
        {showResult ? (
          <p className="flex items-center gap-1.5 text-eyebrow text-accent-fg">
            <CircleCheck aria-hidden className="size-3.5" />
            {readyLabel}
          </p>
        ) : null}
        <h2
          id={titleId}
          className={cn(
            'font-display font-semibold text-cream-50',
            showResult ? 'break-words text-xl sm:text-2xl' : 'text-lg',
          )}
        >
          {title}
        </h2>
      </div>
      <output className="sr-only">{announcement}</output>
      {isGenerating ? (
        <GeneratingState
          mode={mode}
          progress={progress}
          workingHintKey={workingHintKey}
          requestStarted={requestStarted}
        />
      ) : null}
      {showError ? (
        <GenerationErrorState message={error} onRetry={onRetry} />
      ) : null}
      <CoverErrorNotice message={coverError} />
      {showResult ? (
        <ResultBody
          outcome={result}
          requestedTrackCount={requestedTrackCount}
          copied={copied}
          onCopy={onCopy}
          onRetry={onRetry}
          onAdjust={onAdjust}
          onCreateAnother={onCreateAnother}
        />
      ) : null}
    </section>
  )
}
