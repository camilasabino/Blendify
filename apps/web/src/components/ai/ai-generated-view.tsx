import { useEffect, useRef, type RefObject } from 'react'
import { CircleCheck, Pin, SlidersHorizontal } from 'lucide-react'
import type {
  CreateAiRefinementRequest,
  PlaylistTransferDto,
  PublishAiPlaylistRequest,
  TrackDto,
} from '@blendify/contracts'
import { Button } from '@/components/ui/button'
import { useAiRefinementDraft } from '@/hooks/use-ai-refinement-draft'
import type {
  AiFlowState,
  AiRefinementActivity,
  AiRefinementSettlement,
} from '@/hooks/use-ai-session'
import { useT } from '@/i18n/use-t'
import type { AppMode } from '@/lib/capabilities'
import { AiGeneratedPlaylist } from './ai-generated-playlist'
import { AiPlaylistDestination } from './ai-playlist-destination'
import { AiRefinementBadge } from './ai-refinement-badge'
import { AiRefinementComposer } from './ai-refinement-composer'
import { refinementErrorMessage } from './ai-refinement-copy'
import { AiRefinementReview } from './ai-refinement-review'

type AiGeneratedFlow = Extract<AiFlowState, { phase: 'generated' }>

type AiGeneratedViewProps = Readonly<{
  flow: AiGeneratedFlow
  mode: AppMode
  playlistTitle: string | null
  onTitleChange: (title: string | null) => void
  headingRef: RefObject<HTMLHeadingElement | null>
  onStartOver: () => void
  onPublish: (input: PublishAiPlaylistRequest) => void
  onPrepareTransfer: (name: string) => Promise<PlaylistTransferDto>
  onRefine: (input: CreateAiRefinementRequest) => void
  onApply: () => void
  onDismiss: () => void
  settlement: AiRefinementSettlement | null
  onClearRefinementError: () => void
}>

function statusMessageKey(
  activity: AiRefinementActivity | null,
  settlement: AiRefinementSettlement | null,
) {
  switch (activity) {
    case 'refining':
      return 'ai.refine.refining'
    case 'applying':
      return 'ai.refine.review.applying'
    case 'dismissing':
      return 'ai.refine.review.dismissing'
    case null:
      break
  }
  if (settlement === 'applied') {
    return 'ai.refine.applied'
  }
  return settlement === 'dismissed' ? 'ai.refine.dismissed' : null
}

export function AiGeneratedView({
  flow,
  mode,
  playlistTitle,
  onTitleChange,
  headingRef,
  onStartOver,
  onPublish,
  onPrepareTransfer,
  onRefine,
  onApply,
  onDismiss,
  settlement,
  onClearRefinementError,
}: AiGeneratedViewProps) {
  const t = useT()
  const draft = useAiRefinementDraft(flow.preservation)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const refineButtonRef = useRef<HTMLButtonElement>(null)
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null)
  const reopenAfterDismiss = useRef(false)
  const pendingId = flow.refinement?.id ?? null
  const previousPendingId = useRef(pendingId)
  const previousSettlement = useRef(settlement)
  const isRefining = flow.refinementActivity === 'refining'
  const canRefine =
    flow.destination === null && !flow.isPublishing && flow.refinement === null
  const isComposing = draft.isOpen && canRefine
  const blocksDestination = flow.refinement !== null || isRefining
  const showsPendingNotice = blocksDestination && flow.destination === null
  const showsDestination = flow.destination !== null || (!blocksDestination && !isComposing)
  const statusKey = statusMessageKey(flow.refinementActivity, settlement)
  const refinementError = flow.refinementError
  const { close: closeDraft, open: openDraft, reset: resetDraft } = draft

  useEffect(() => {
    const previous = previousPendingId.current
    previousPendingId.current = pendingId
    if (pendingId !== null && pendingId !== previous) {
      closeDraft()
      window.requestAnimationFrame(() => reviewHeadingRef.current?.focus())
    }
  }, [pendingId, closeDraft])

  useEffect(() => {
    const previous = previousSettlement.current
    previousSettlement.current = settlement
    if (settlement === previous) {
      return
    }
    if (settlement === 'applied') {
      resetDraft()
      headingRef.current?.focus()
      return
    }
    if (settlement !== 'dismissed') {
      return
    }
    if (reopenAfterDismiss.current) {
      reopenAfterDismiss.current = false
      openDraft()
      return
    }
    window.requestAnimationFrame(() => refineButtonRef.current?.focus())
  }, [settlement, headingRef, openDraft, resetDraft])

  useEffect(() => {
    if (isComposing) {
      textareaRef.current?.focus()
    }
  }, [isComposing])

  function openComposer() {
    onClearRefinementError()
    draft.open()
  }

  function cancelComposer() {
    onClearRefinementError()
    draft.close()
    window.requestAnimationFrame(() => refineButtonRef.current?.focus())
  }

  function submit() {
    const refinement = draft.text.trim()
    if (!refinement) {
      draft.setValidationError(t('ai.refine.required'))
      textareaRef.current?.focus()
      return
    }
    const preservePositions = draft.positionChanges()
    onRefine(preservePositions ? { refinement, preservePositions } : { refinement })
  }

  function tryAgain() {
    reopenAfterDismiss.current = true
    onDismiss()
  }

  function keepAccessory(track: TrackDto, position: number) {
    if (draft.locked.has(position)) {
      return (
        <AiRefinementBadge
          tone="kept"
          icon={<Pin aria-hidden className="size-3" />}
          label={t('ai.refine.keptTrack', { track: track.name })}
        >
          {t('ai.refine.kept')}
        </AiRefinementBadge>
      )
    }
    return (
      <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-control px-1.5 py-1 text-xs text-cream-200 hover:bg-hover">
        <input
          type="checkbox"
          checked={draft.selected.has(position)}
          disabled={isRefining}
          onChange={() => draft.toggle(position)}
          aria-label={t('ai.refine.keepTrack', { track: track.name })}
          className="size-4 accent-amber-500"
        />
        <span aria-hidden>{t('ai.refine.keepLabel')}</span>
      </label>
    )
  }

  return (
    <AiGeneratedPlaylist
      intent={flow.intent}
      result={flow.result}
      title={playlistTitle}
      onTitleChange={onTitleChange}
      isTitleLocked={flow.destination !== null || flow.isPublishing}
      destination={flow.destination}
      headingRef={headingRef}
      onStartOver={onStartOver}
      showTracks={flow.refinement?.status !== 'candidate_ready'}
      trackAccessory={isComposing ? keepAccessory : undefined}
    >
      <p role="status" className="sr-only">
        {statusKey ? t(statusKey) : ''}
      </p>

      {canRefine && !draft.isOpen ? (
        <div className="flex flex-col gap-3 rounded-card border border-divider p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            {settlement === 'applied' ? (
              <p className="flex items-center gap-1.5 text-sm text-cream-100">
                <CircleCheck aria-hidden className="size-4 shrink-0 text-accent-fg" />
                {t('ai.refine.applied')}
              </p>
            ) : null}
            <p className="text-sm leading-relaxed text-cream-300">{t('ai.refine.openHint')}</p>
            {refinementError ? (
              <p role="alert" className="text-sm leading-relaxed text-danger">
                {refinementErrorMessage(refinementError, t, 'ai.refine.error.settle')}
              </p>
            ) : null}
          </div>
          <Button
            ref={refineButtonRef}
            type="button"
            variant="secondary"
            className="w-full shrink-0 sm:w-auto"
            onClick={openComposer}
          >
            <SlidersHorizontal aria-hidden className="size-4" />
            {t('ai.refine.open')}
          </Button>
        </div>
      ) : null}

      {isComposing ? (
        <AiRefinementComposer
          text={draft.text}
          onTextChange={draft.changeText}
          onSubmit={submit}
          onCancel={cancelComposer}
          isPending={isRefining}
          validationError={draft.validationError}
          requestError={
            refinementError
              ? refinementErrorMessage(refinementError, t, 'ai.refine.error.generic')
              : null
          }
          selectedCount={draft.selected.size}
          keptCount={draft.locked.size}
          textareaRef={textareaRef}
        />
      ) : null}

      {flow.refinement ? (
        <AiRefinementReview
          refinement={flow.refinement}
          currentTracks={flow.result.playlist.tracks}
          activity={flow.refinementActivity}
          error={
            refinementError
              ? refinementErrorMessage(refinementError, t, 'ai.refine.error.settle')
              : null
          }
          headingRef={reviewHeadingRef}
          onApply={onApply}
          onDismiss={onDismiss}
          onTryAgain={tryAgain}
        />
      ) : null}

      {showsPendingNotice ? (
        <p className="rounded-card border border-divider bg-card p-4 text-sm leading-relaxed text-cream-300">
          {t('ai.refine.pendingDestination')}
        </p>
      ) : null}

      {showsDestination ? (
        <AiPlaylistDestination
          mode={mode}
          intentKind={flow.intent.kind}
          title={playlistTitle?.trim() || flow.result.playlist.name}
          destination={flow.destination}
          transferAvailable={flow.result.transferAvailable}
          isPublishing={flow.isPublishing}
          publishError={flow.publishError}
          onPublish={onPublish}
          onPrepareTransfer={onPrepareTransfer}
        />
      ) : null}
    </AiGeneratedPlaylist>
  )
}
