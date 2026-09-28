import { useId, type ReactNode, type RefObject } from 'react'
import { ArrowUpDown, Check, Pin, Plus, RotateCcw } from 'lucide-react'
import type { AiRefinementDto, TrackDto } from '@blendify/contracts'
import { GeneratedTrackList } from '@/components/playlist/generated-track-list'
import { Button } from '@/components/ui/button'
import type { AiRefinementActivity } from '@/hooks/use-ai-session'
import { useT } from '@/i18n/use-t'
import { formatSongCount } from '@/lib/song-count'
import { formatListeningTime } from '@/lib/utils'
import { CATEGORY_LABEL_KEYS } from './ai-copy'
import { generationFailureView } from './ai-generation-copy'
import { AiRefinementBadge } from './ai-refinement-badge'
import { refinementClarificationMessage } from './ai-refinement-copy'
import { AiRefinementDiff } from './ai-refinement-diff'
import { AiUnmetConstraints } from './ai-unmet-constraints'

type AiRefinementReviewProps = Readonly<{
  refinement: AiRefinementDto
  currentTracks: readonly TrackDto[]
  activity: AiRefinementActivity | null
  error: string | null
  headingRef: RefObject<HTMLHeadingElement | null>
  onApply: () => void
  onDismiss: () => void
  onTryAgain: () => void
}>

export function AiRefinementReview(props: AiRefinementReviewProps) {
  const { refinement } = props

  switch (refinement.status) {
    case 'candidate_ready':
      return <CandidateReview {...props} refinement={refinement} />
    case 'candidate_failed':
      return <CandidateFailure {...props} refinement={refinement} />
    case 'needs_clarification':
      return <RefinementClarification {...props} refinement={refinement} />
    case 'unchanged':
      return <RefinementUnchanged {...props} />
  }
}

function ReviewPanel({
  title,
  headingRef,
  tone = 'default',
  children,
}: Readonly<{
  title: string
  headingRef: RefObject<HTMLHeadingElement | null>
  tone?: 'default' | 'proposed' | 'danger'
  children: ReactNode
}>) {
  const headingId = useId()
  const toneClassName = {
    default: 'border-divider bg-card',
    proposed: 'border-dashed border-accent-line/70 bg-card',
    danger: 'border-danger-line bg-card',
  }[tone]

  return (
    <section
      aria-labelledby={headingId}
      className={`animate-fade-up space-y-4 rounded-card border p-4 sm:p-5 ${toneClassName}`}
    >
      <h3
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-base font-semibold text-cream-50 outline-none"
      >
        {title}
      </h3>
      {children}
    </section>
  )
}

function ActionError({ error }: Readonly<{ error: string | null }>) {
  if (!error) {
    return null
  }
  return (
    <p role="alert" className="text-sm leading-relaxed text-danger">
      {error}
    </p>
  )
}

function Actions({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>
}

function CandidateReview({
  refinement,
  currentTracks,
  activity,
  error,
  headingRef,
  onApply,
  onDismiss,
}: AiRefinementReviewProps & {
  refinement: Extract<AiRefinementDto, { status: 'candidate_ready' }>
}) {
  const t = useT()
  const { candidate, diff } = refinement
  const tracks = candidate.playlist.tracks
  const added = new Set(diff.tracks.added.map((item) => item.position))
  const moved = new Set(diff.tracks.moved.map((item) => item.to))
  const kept = new Set(diff.preservedPositions)
  const isBusy = activity !== null
  const meta = [
    formatSongCount(candidate.trackCount, t),
    candidate.durationMs > 0 ? formatListeningTime(candidate.durationMs) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  function badgeFor(_track: TrackDto, position: number) {
    if (kept.has(position)) {
      return (
        <AiRefinementBadge tone="kept" icon={<Pin aria-hidden className="size-3" />}>
          {t('ai.refine.kept')}
        </AiRefinementBadge>
      )
    }
    if (added.has(position)) {
      return (
        <AiRefinementBadge tone="added" icon={<Plus aria-hidden className="size-3" />}>
          {t('ai.refine.diff.added')}
        </AiRefinementBadge>
      )
    }
    if (moved.has(position)) {
      return (
        <AiRefinementBadge tone="moved" icon={<ArrowUpDown aria-hidden className="size-3" />}>
          {t('ai.refine.diff.moved')}
        </AiRefinementBadge>
      )
    }
    return null
  }

  return (
    <ReviewPanel title={t('ai.refine.review.title')} headingRef={headingRef} tone="proposed">
      <p className="text-sm leading-relaxed text-cream-300">{t('ai.refine.review.subtitle')}</p>

      <AiRefinementDiff diff={diff} currentTracks={currentTracks} proposedTracks={tracks} />

      {refinement.notApplied.length > 0 ? (
        <div className="space-y-1.5 rounded-control border border-divider p-3">
          <h4 className="text-sm font-medium text-cream-100">{t('ai.refine.review.notApplied')}</h4>
          <p className="text-sm text-cream-400">{t('ai.refine.review.notAppliedHint')}</p>
          <ul className="space-y-1 text-sm text-cream-300">
            {refinement.notApplied.map((constraint) => (
              <li key={`${constraint.category}:${constraint.userText}`} className="break-words">
                <span className="text-cream-400">{t(CATEGORY_LABEL_KEYS[constraint.category])}: </span>
                “{constraint.userText}”
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="space-y-0.5">
          <h4 className="font-display text-sm font-semibold text-cream-100">
            {t('ai.refine.review.proposedPlaylist')}
          </h4>
          <p className="text-sm text-cream-400">{meta}</p>
        </div>
        <AiUnmetConstraints constraints={candidate.unmetConstraints} />
        <GeneratedTrackList
          tracks={tracks}
          label={t('ai.refine.review.proposedTrackList')}
          accessory={badgeFor}
        />
      </div>

      <ActionError error={error} />
      <Actions>
        <Button
          type="button"
          className="w-full sm:w-auto"
          loading={activity === 'applying'}
          disabled={isBusy}
          onClick={onApply}
        >
          {activity === 'applying' ? null : <Check aria-hidden className="size-4" />}
          {activity === 'applying' ? t('ai.refine.review.applying') : t('ai.refine.review.apply')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="w-full sm:w-auto"
          loading={activity === 'dismissing'}
          disabled={isBusy}
          onClick={onDismiss}
        >
          {activity === 'dismissing' ? t('ai.refine.review.dismissing') : t('ai.refine.review.cancel')}
        </Button>
      </Actions>
    </ReviewPanel>
  )
}

function CandidateFailure({
  refinement,
  activity,
  error,
  headingRef,
  onDismiss,
}: AiRefinementReviewProps & {
  refinement: Extract<AiRefinementDto, { status: 'candidate_failed' }>
}) {
  const t = useT()
  const view = generationFailureView(refinement.error, null, t)

  return (
    <ReviewPanel title={t('ai.refine.failed.title')} headingRef={headingRef} tone="danger">
      <div className="space-y-1">
        <p className="text-sm leading-relaxed text-danger">{view.message}</p>
        <p className="text-sm text-cream-300">{t('ai.refine.failed.hint')}</p>
      </div>
      <ActionError error={error} />
      <Actions>
        <Button
          type="button"
          variant="secondary"
          className="w-full sm:w-auto"
          loading={activity === 'dismissing'}
          disabled={activity !== null}
          onClick={onDismiss}
        >
          {t('ai.refine.dismiss')}
        </Button>
      </Actions>
    </ReviewPanel>
  )
}

function RefinementClarification({
  refinement,
  activity,
  error,
  headingRef,
  onDismiss,
  onTryAgain,
}: AiRefinementReviewProps & {
  refinement: Extract<AiRefinementDto, { status: 'needs_clarification' }>
}) {
  const t = useT()

  return (
    <ReviewPanel title={t('ai.refine.clarify.title')} headingRef={headingRef}>
      <p className="text-sm leading-relaxed text-cream-200">
        {refinementClarificationMessage(refinement.clarification, t)}
      </p>
      <ActionError error={error} />
      <Actions>
        <Button
          type="button"
          className="w-full sm:w-auto"
          disabled={activity !== null}
          onClick={onTryAgain}
        >
          <RotateCcw aria-hidden className="size-4" />
          {t('ai.refine.tryAgain')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full sm:w-auto"
          disabled={activity !== null}
          onClick={onDismiss}
        >
          {t('ai.refine.continue')}
        </Button>
      </Actions>
    </ReviewPanel>
  )
}

function RefinementUnchanged({
  activity,
  error,
  headingRef,
  onDismiss,
  onTryAgain,
}: AiRefinementReviewProps) {
  const t = useT()

  return (
    <ReviewPanel title={t('ai.refine.unchanged.title')} headingRef={headingRef}>
      <p className="text-sm leading-relaxed text-cream-200">{t('ai.refine.unchanged.body')}</p>
      <ActionError error={error} />
      <Actions>
        <Button
          type="button"
          className="w-full sm:w-auto"
          disabled={activity !== null}
          onClick={onDismiss}
        >
          {t('ai.refine.continue')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full sm:w-auto"
          disabled={activity !== null}
          onClick={onTryAgain}
        >
          {t('ai.refine.tryAgain')}
        </Button>
      </Actions>
    </ReviewPanel>
  )
}
