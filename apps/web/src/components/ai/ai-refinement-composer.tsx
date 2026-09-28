import { useId, type FormEvent, type KeyboardEvent, type RefObject } from 'react'
import { Sparkles } from 'lucide-react'
import { AI_REFINEMENT_MAX_LENGTH } from '@blendify/contracts'
import { Button } from '@/components/ui/button'
import { SelectableChip } from '@/components/ui/chip'
import { FieldError } from '@/components/ui/feedback'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'

const EXAMPLE_KEYS: readonly MessageKey[] = [
  'ai.refine.example.lessMainstream',
  'ai.refine.example.removeArtist',
  'ai.refine.example.keepFirst',
  'ai.refine.example.trackCount',
]

type AiRefinementComposerProps = Readonly<{
  text: string
  onTextChange: (text: string) => void
  onSubmit: () => void
  onCancel: () => void
  isPending: boolean
  validationError: string | null
  requestError: string | null
  selectedCount: number
  keptCount: number
  textareaRef: RefObject<HTMLTextAreaElement | null>
}>

export function AiRefinementComposer({
  text,
  onTextChange,
  onSubmit,
  onCancel,
  isPending,
  validationError,
  requestError,
  selectedCount,
  keptCount,
  textareaRef,
}: AiRefinementComposerProps) {
  const t = useT()
  const headingId = useId()
  const fieldId = useId()
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

  function applyExample(key: MessageKey) {
    onTextChange(t(key))
    textareaRef.current?.focus()
  }

  return (
    <section
      aria-labelledby={headingId}
      className="animate-fade-up space-y-4 rounded-card border border-accent-line/50 bg-card p-4"
    >
      <h3 id={headingId} className="font-display text-sm font-semibold text-cream-50">
        {t('ai.refine.title')}
      </h3>
      <form onSubmit={submit} className="space-y-4" aria-busy={isPending}>
        <div className="space-y-2">
          <Label htmlFor={fieldId}>{t('ai.refine.label')}</Label>
          <p id={hintId} className="text-sm leading-relaxed text-cream-300">
            {t('ai.refine.hint')}
          </p>
          <Textarea
            ref={textareaRef}
            id={fieldId}
            value={text}
            onChange={(event) => onTextChange(event.target.value)}
            onKeyDown={submitWithShortcut}
            placeholder={t('ai.refine.placeholder')}
            maxLength={AI_REFINEMENT_MAX_LENGTH}
            rows={3}
            readOnly={isPending}
            aria-invalid={validationError ? true : undefined}
            aria-describedby={validationError ? `${errorId} ${hintId}` : hintId}
          />
          <FieldError>
            {validationError ? <span id={errorId}>{validationError}</span> : null}
          </FieldError>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-cream-300">{t('ai.refine.examplesLabel')}</p>
          <ul className="flex flex-wrap gap-2">
            {EXAMPLE_KEYS.map((key) => (
              <li key={key}>
                <SelectableChip disabled={isPending} onClick={() => applyExample(key)}>
                  {t(key)}
                </SelectableChip>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-1 text-sm text-cream-300">
          <p>{t('ai.refine.keepHint')}</p>
          {keptCount > 0 ? (
            <p className="text-cream-400">{t('ai.refine.keptAlready', { count: keptCount })}</p>
          ) : null}
          {selectedCount > 0 ? (
            <p className="text-cream-400">{t('ai.refine.keepSelected', { count: selectedCount })}</p>
          ) : null}
        </div>

        {requestError && !isPending ? (
          <p role="alert" className="text-sm leading-relaxed text-danger">
            {requestError}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button type="submit" className="w-full sm:w-auto" loading={isPending}>
            {isPending ? null : <Sparkles aria-hidden className="size-4" />}
            {isPending ? t('ai.refine.refining') : t('ai.refine.submit')}
          </Button>
          {isPending ? null : (
            <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={onCancel}>
              {t('ai.refine.cancel')}
            </Button>
          )}
        </div>
      </form>
    </section>
  )
}
