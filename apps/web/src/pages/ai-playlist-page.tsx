import { useEffect, useRef, useState } from 'react'
import { AiClarification } from '@/components/ai/ai-clarification'
import { aiErrorMessage } from '@/components/ai/ai-copy'
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
  const [validationError, setValidationError] = useState<string | null>(null)
  const { session, error, isPending, submit, choose, reset } = useAiSession()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const clarificationRef = useRef<HTMLHeadingElement>(null)
  const summaryRef = useRef<HTMLHeadingElement>(null)

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
    submit(trimmed)
  }

  function editRequest() {
    textareaRef.current?.focus()
  }

  function startOver() {
    reset()
    setPrompt('')
    setValidationError(null)
    textareaRef.current?.focus()
  }

  return (
    <PageContainer width="form">
      <PageHeader
        eyebrow={t('ai.eyebrow')}
        title={t('ai.title')}
        description={t('ai.subtitle')}
      />

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

      {session?.status === 'ready' && session.intent ? (
        <AiIntentSummary
          intent={session.intent}
          headingRef={summaryRef}
          onEdit={editRequest}
          onStartOver={startOver}
        />
      ) : null}
    </PageContainer>
  )
}
