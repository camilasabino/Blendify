import { useEffect, useRef, useState, type RefObject } from 'react'
import { RotateCcw } from 'lucide-react'
import { AiClarification } from '@/components/ai/ai-clarification'
import { aiErrorMessage, canRetryAiRequest, isAiRateLimited } from '@/components/ai/ai-copy'
import { AiCurrentRequest } from '@/components/ai/ai-current-request'
import { AiGeneratedView } from '@/components/ai/ai-generated-view'
import { generationRequestErrorMessage } from '@/components/ai/ai-generation-copy'
import { AiGenerationFailure } from '@/components/ai/ai-generation-failure'
import { AiGenerationProgress } from '@/components/ai/ai-generation-progress'
import { AiIntentSummary } from '@/components/ai/ai-intent-summary'
import { AiPromptForm } from '@/components/ai/ai-prompt-form'
import { AiRateLimitNotice, AiRateLimitRetryButton } from '@/components/ai/ai-rate-limit-notice'
import { AiReviewActions } from '@/components/ai/ai-review-actions'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/feedback'
import { FormSection } from '@/components/ui/form-section'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { LoadingState } from '@/components/ui/spinner'
import { useAiRateLimitWait } from '@/hooks/use-ai-rate-limit-wait'
import { useAiSession, type AiFlowPhase, type AiFlowState } from '@/hooks/use-ai-session'
import { useCapabilities } from '@/hooks/use-capabilities'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { useT } from '@/i18n/use-t'

type FocusTargets = Readonly<{
  textarea: RefObject<HTMLTextAreaElement | null>
  clarification: RefObject<HTMLHeadingElement | null>
  summary: RefObject<HTMLHeadingElement | null>
  progress: RefObject<HTMLHeadingElement | null>
  result: RefObject<HTMLHeadingElement | null>
  failure: RefObject<HTMLHeadingElement | null>
}>

function focusTarget(
  phase: AiFlowPhase,
  targets: FocusTargets,
): RefObject<HTMLElement | null> | null {
  switch (phase) {
    case 'composing':
      return targets.textarea
    case 'clarifying':
      return targets.clarification
    case 'reviewed':
      return targets.summary
    case 'generating':
      return targets.progress
    case 'generated':
      return targets.result
    case 'generation_failed':
      return targets.failure
    case 'restoring':
    case 'interpreting':
      return null
  }
}

function useFocusOnPhaseChange(phase: AiFlowPhase, targets: FocusTargets) {
  const previousPhase = useRef<AiFlowPhase | null>(null)

  useEffect(() => {
    const previous = previousPhase.current
    previousPhase.current = phase
    if (previous === null || previous === 'restoring' || previous === phase) {
      return
    }
    focusTarget(phase, targets)?.current?.focus()
  }, [phase, targets])
}

function hasReviewedIntent(flow: AiFlowState): flow is Extract<AiFlowState, { intent: unknown }> {
  return 'intent' in flow
}

export function AiPlaylistPage() {
  const t = useT()
  useDocumentTitle(t('nav.ai'))
  const {
    flow,
    submittedPrompt,
    playlistTitle,
    renamePlaylist,
    submit,
    choose,
    generate,
    publish,
    prepareTransfer,
    refine,
    applyRefinement,
    dismissRefinement,
    refinementSettlement,
    clearRefinementError,
    checkStatus,
    retryRestore,
    reset,
  } = useAiSession()
  const { mode } = useCapabilities()
  const [prompt, setPrompt] = useState(submittedPrompt)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const targets = useRef<FocusTargets>({
    textarea: { current: null },
    clarification: { current: null },
    summary: { current: null },
    progress: { current: null },
    result: { current: null },
    failure: { current: null },
  }).current

  useFocusOnPhaseChange(flow.phase, targets)

  useEffect(() => {
    if (isEditing) {
      targets.textarea.current?.focus()
    }
  }, [isEditing, targets])

  const reviewed = hasReviewedIntent(flow) ? flow : null
  const isCompact = reviewed !== null && !isEditing
  const isInterpreting =
    flow.phase === 'interpreting' || (flow.phase === 'clarifying' && flow.isAnswering)
  let requestError: unknown = null
  if (flow.phase === 'composing' || flow.phase === 'clarifying') {
    requestError = flow.error
  }
  const composing = flow.phase === 'composing' ? flow : null
  const requestErrorMessage = composing?.restoreFailed
    ? t('ai.error.restoreFailed')
    : aiErrorMessage(requestError, t)
  const canRetryRequest =
    composing !== null && !composing.restoreFailed && canRetryAiRequest(requestError)
  const rateLimitError =
    composing !== null && !composing.restoreFailed && isAiRateLimited(composing.error)
      ? composing.error
      : null
  const rateLimitWaitSeconds = useAiRateLimitWait(rateLimitError)
  const isRateLimitWaiting = rateLimitWaitSeconds !== null

  function changePrompt(next: string) {
    setPrompt(next)
    setValidationError(null)
  }

  function submitPrompt() {
    if (isRateLimitWaiting) {
      return
    }

    const trimmed = prompt.trim()
    if (!trimmed) {
      setValidationError(t('ai.promptRequired'))
      targets.textarea.current?.focus()
      return
    }

    setValidationError(null)
    setIsEditing(false)
    submit(trimmed)
  }

  function editRequest() {
    setPrompt(submittedPrompt)
    setIsEditing(true)
  }

  function cancelEdit() {
    setPrompt(submittedPrompt)
    setValidationError(null)
    setIsEditing(false)
    window.requestAnimationFrame(() => editButtonRef.current?.focus())
  }

  function startOver() {
    reset()
    setPrompt('')
    setValidationError(null)
    setIsEditing(false)
  }

  return (
    <PageContainer width="form">
      <PageHeader
        eyebrow={t('ai.eyebrow')}
        title={t('ai.title')}
        description={isCompact || flow.phase === 'restoring' ? undefined : t('ai.subtitle')}
      />

      {flow.phase === 'restoring' ? <LoadingState label={t('ai.restoring')} /> : null}

      {isCompact ? (
        <AiCurrentRequest
          prompt={submittedPrompt}
          onEdit={editRequest}
          editButtonRef={editButtonRef}
        />
      ) : null}

      {!isCompact && flow.phase !== 'restoring' ? (
        <FormSection accent="amber" title={t('ai.requestTitle')}>
          <AiPromptForm
            prompt={prompt}
            onPromptChange={changePrompt}
            onSubmit={submitPrompt}
            isPending={isInterpreting}
            isSubmitBlocked={isRateLimitWaiting}
            validationError={validationError}
            textareaRef={targets.textarea}
            onCancel={isEditing ? cancelEdit : undefined}
          />
        </FormSection>
      ) : null}

      <p role="status" className="sr-only">
        {isInterpreting ? t('ai.interpreting') : ''}
      </p>

      {rateLimitError && !isInterpreting ? (
        <AiRateLimitNotice error={rateLimitError}>
          <AiRateLimitRetryButton waitSeconds={rateLimitWaitSeconds} onRetry={submitPrompt} />
        </AiRateLimitNotice>
      ) : null}

      {requestError && !rateLimitError && !isInterpreting ? (
        <ErrorState message={requestErrorMessage} messageRole="alert">
          {composing?.restoreFailed ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              loading={composing.isRestoring}
              onClick={retryRestore}
            >
              {composing.isRestoring ? null : <RotateCcw aria-hidden className="size-3.5" />}
              {t('common.retry')}
            </Button>
          ) : null}
          {canRetryRequest ? (
            <Button type="button" size="sm" variant="secondary" onClick={submitPrompt}>
              <RotateCcw aria-hidden className="size-3.5" />
              {t('common.retry')}
            </Button>
          ) : null}
        </ErrorState>
      ) : null}

      {flow.phase === 'clarifying' ? (
        <AiClarification
          clarification={flow.clarification}
          isPending={flow.isAnswering}
          onChoose={choose}
          onEdit={() => targets.textarea.current?.focus()}
          headingRef={targets.clarification}
        />
      ) : null}

      {isCompact && flow.phase === 'generating' ? (
        <AiGenerationProgress
          progress={flow.progress}
          isStalled={flow.isStalled}
          onCheckAgain={checkStatus}
          headingRef={targets.progress}
        />
      ) : null}

      {isCompact && flow.phase === 'generated' ? (
        <AiGeneratedView
          flow={flow}
          mode={mode}
          playlistTitle={playlistTitle}
          onTitleChange={renamePlaylist}
          headingRef={targets.result}
          onStartOver={startOver}
          onPublish={publish}
          onPrepareTransfer={prepareTransfer}
          onRefine={refine}
          onApply={applyRefinement}
          onDismiss={dismissRefinement}
          settlement={refinementSettlement}
          onClearRefinementError={clearRefinementError}
        />
      ) : null}

      {isCompact && flow.phase === 'generation_failed' ? (
        <AiGenerationFailure
          failure={flow.failure}
          liveError={flow.liveError}
          kind={flow.intent.kind}
          headingRef={targets.failure}
          onEdit={editRequest}
          onRetry={generate}
          onStartOver={startOver}
        />
      ) : null}

      {reviewed && isCompact ? (
        <AiIntentSummary
          intent={reviewed.intent}
          variant={flow.phase === 'generated' ? 'context' : 'review'}
          headingRef={targets.summary}
          footer={
            flow.phase === 'reviewed' ? (
              <AiReviewActions
                requestError={
                  flow.requestError
                    ? generationRequestErrorMessage(flow.requestError, t, flow.intent.kind)
                    : null
                }
                onCreate={generate}
                onStartOver={startOver}
              />
            ) : null
          }
        />
      ) : null}
    </PageContainer>
  )
}
