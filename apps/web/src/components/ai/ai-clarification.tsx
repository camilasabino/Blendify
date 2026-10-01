import type { RefObject } from 'react'
import { Pencil } from 'lucide-react'
import type { AiClarification as AiClarificationDto } from '@blendify/contracts'
import { useGenreLabel } from '@/components/genres/genre-labels'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/use-t'
import { CATEGORY_LABEL_KEYS, clarificationMessage, optionLabel } from './ai-copy'

type AiClarificationProps = Readonly<{
  clarification: AiClarificationDto
  isPending: boolean
  onChoose: (optionId: string) => void
  onEdit: () => void
  headingRef: RefObject<HTMLHeadingElement | null>
}>

export function AiClarification({
  clarification,
  isPending,
  onChoose,
  onEdit,
  headingRef,
}: AiClarificationProps) {
  const t = useT()
  const genreLabel = useGenreLabel()
  const hasOptions = clarification.options.length > 0

  return (
    <section
      aria-labelledby="ai-clarification-title"
      className="space-y-4 rounded-panel border border-accent-line/40 bg-panel p-5 sm:p-6"
    >
      <h2
        id="ai-clarification-title"
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-lg font-semibold tracking-tight text-cream-50 outline-none"
      >
        {t('ai.clarify.title')}
      </h2>
      <p className="text-sm leading-relaxed text-cream-200">
        {clarificationMessage(clarification, t)}
      </p>

      {clarification.unsupportedConstraints.length > 0 ? (
        <ul className="space-y-1 text-sm text-cream-300">
          {clarification.unsupportedConstraints.map((constraint) => (
            <li key={`${constraint.category}:${constraint.userText}`}>
              <span className="text-cream-400">{t(CATEGORY_LABEL_KEYS[constraint.category])}: </span>
              “{constraint.userText}”
            </li>
          ))}
        </ul>
      ) : null}

      {hasOptions ? (
        <fieldset disabled={isPending} className="space-y-2">
          <legend className="text-sm font-medium text-cream-200">
            {t('ai.clarify.optionsLabel')}
          </legend>
          <div className="flex flex-wrap gap-2">
            {clarification.options.map((option) => (
              <Button
                key={option.id}
                variant="secondary"
                onClick={() => onChoose(option.id)}
              >
                {optionLabel(option, clarification, t, genreLabel)}
              </Button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <p className="text-sm text-cream-400">
          {hasOptions ? t('ai.clarify.orEdit') : t('ai.clarify.edit')}
        </p>
        <Button
          type="button"
          variant={hasOptions ? 'ghost' : 'secondary'}
          size="sm"
          className="self-start"
          disabled={isPending}
          onClick={onEdit}
        >
          <Pencil aria-hidden className="size-3.5" />
          {t('ai.editRequest')}
        </Button>
      </div>
    </section>
  )
}
