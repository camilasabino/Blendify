import { useId, type FormEvent, type KeyboardEvent, type RefObject } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SelectableChip } from '@/components/ui/chip'
import { FieldError } from '@/components/ui/feedback'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { AI_PROMPT_MAX_LENGTH } from '@blendify/contracts'

const SUGGESTION_KEYS: readonly MessageKey[] = [
  'ai.suggestion.artists',
  'ai.suggestion.genres',
  'ai.suggestion.discoverArtist',
  'ai.suggestion.discoverTrack',
]

type AiPromptFormProps = Readonly<{
  prompt: string
  onPromptChange: (prompt: string) => void
  onSubmit: () => void
  isPending: boolean
  validationError: string | null
  textareaRef: RefObject<HTMLTextAreaElement | null>
}>

export function AiPromptForm({
  prompt,
  onPromptChange,
  onSubmit,
  isPending,
  validationError,
  textareaRef,
}: AiPromptFormProps) {
  const t = useT()
  const promptId = useId()
  const hintId = useId()
  const errorId = useId()

  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit()
  }

  function submitWithShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      onSubmit()
    }
  }

  function applySuggestion(key: MessageKey) {
    onPromptChange(t(key))
    textareaRef.current?.focus()
  }

  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={isPending}>
      <div className="space-y-2">
        <Label htmlFor={promptId}>{t('ai.promptLabel')}</Label>
        <Textarea
          ref={textareaRef}
          id={promptId}
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={submitWithShortcut}
          placeholder={t('ai.promptPlaceholder')}
          maxLength={AI_PROMPT_MAX_LENGTH}
          rows={4}
          readOnly={isPending}
          aria-invalid={validationError ? true : undefined}
          aria-describedby={validationError ? `${errorId} ${hintId}` : hintId}
        />
        <p id={hintId} className="text-xs text-cream-400">
          {t('ai.promptHint')}
        </p>
        <FieldError>
          {validationError ? <span id={errorId}>{validationError}</span> : null}
        </FieldError>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-cream-300">{t('ai.suggestionsLabel')}</p>
        <ul className="flex flex-wrap gap-2">
          {SUGGESTION_KEYS.map((key) => (
            <li key={key}>
              <SelectableChip disabled={isPending} onClick={() => applySuggestion(key)}>
                {t(key)}
              </SelectableChip>
            </li>
          ))}
        </ul>
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full sm:w-auto"
        loading={isPending}
      >
        {!isPending ? <Sparkles aria-hidden className="size-4" /> : null}
        {isPending ? t('ai.submitting') : t('ai.submit')}
      </Button>
    </form>
  )
}
