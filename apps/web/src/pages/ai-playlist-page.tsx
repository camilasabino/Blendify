import { useEffect, useRef, useState } from 'react'
import { AiClarification } from '@/components/ai/ai-clarification'
import { aiErrorMessage } from '@/components/ai/ai-copy'
import { AiCurrentRequest } from '@/components/ai/ai-current-request'
import { AiIntentSummary } from '@/components/ai/ai-intent-summary'
import { AiPromptForm } from '@/components/ai/ai-prompt-form'
import { ErrorState } from '@/components/ui/feedback'
import { FormSection } from '@/components/ui/form-section'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { useAiSession } from '@/hooks/use-ai-session'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { useT } from '@/i18n/use-t'

export function AiPlaylistPage() {
  const t = useT()
  useDocumentTitle(t('nav.ai'))
  const [prompt, setPrompt] = useState('')
  const [submittedPrompt, setSubmittedPrompt] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const { session, error, isPending, submit, choose, reset } = useAiSession()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const clarificationRef = useRef<HTMLHeadingElement>(null)
  const summaryRef = useRef<HTMLHeadingElement>(null)

  const readyIntent = session?.status === 'ready' ? session.intent : null
  const isCompact = readyIntent !== null && !isEditing

  useEffect(() => {
    if (!session) {
      return
    }
    const heading = session.status === 'ready' ? summaryRef : clarificationRef
    heading.current?.focus()
  }, [session])

  useEffect(() => {
    if (error) {
      textareaRef.current?.focus()
    }
  }, [error])

  useEffect(() => {
    if (isEditing) {
      textareaRef.current?.focus()
    }
  }, [isEditing])

  function changePrompt(next: string) {
    setPrompt(next)
    setValidationError(null)
  }

  function submitPrompt() {
    const trimmed = prompt.trim()
    if (!trimmed) {
      setValidationError(t('ai.promptRequired'))
      textareaRef.current?.focus()
      return
    }

    setValidationError(null)
    setIsEditing(false)
    setSubmittedPrompt(trimmed)
    submit(trimmed)
  }

  function editRequest() {
    setIsEditing(true)
  }

  function startOver() {
    reset()
    setPrompt('')
    setSubmittedPrompt('')
    setValidationError(null)
    setIsEditing(true)
  }

  return (
    <PageContainer width="form">
      <PageHeader
        eyebrow={t('ai.eyebrow')}
        title={t('ai.title')}
        description={isCompact ? undefined : t('ai.subtitle')}
      />

      {isCompact ? (
        <AiCurrentRequest prompt={submittedPrompt} onEdit={editRequest} />
      ) : (
        <FormSection accent="amber" title={t('ai.requestTitle')}>
          <AiPromptForm
            prompt={prompt}
            onPromptChange={changePrompt}
            onSubmit={submitPrompt}
            isPending={isPending}
            validationError={validationError}
            textareaRef={textareaRef}
          />
        </FormSection>
      )}

      <p role="status" className="sr-only">
        {isPending ? t('ai.interpreting') : ''}
      </p>

      {error && !isPending ? (
        <div role="alert">
          <ErrorState message={aiErrorMessage(error, t)} />
        </div>
      ) : null}

      {session?.clarification ? (
        <AiClarification
          clarification={session.clarification}
          isPending={isPending}
          onChoose={choose}
          headingRef={clarificationRef}
        />
      ) : null}

      {readyIntent && !isEditing ? (
        <AiIntentSummary
          intent={readyIntent}
          headingRef={summaryRef}
          onStartOver={startOver}
        />
      ) : null}
    </PageContainer>
  )
}
