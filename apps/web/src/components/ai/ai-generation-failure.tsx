import type { RefObject } from 'react'
import { Pencil, RotateCcw } from 'lucide-react'
import type { AiGenerationFailureDto } from '@blendify/contracts'
import { SpotifyLimitExplanation } from '@/components/brand/spotify-limit-explanation'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/use-t'
import { generationFailureView } from './ai-generation-copy'

type AiGenerationFailureProps = Readonly<{
  failure: AiGenerationFailureDto
  liveError: unknown
  headingRef: RefObject<HTMLHeadingElement | null>
  onEdit: () => void
  onRetry: () => void
  onStartOver: () => void
}>

export function AiGenerationFailure({
  failure,
  liveError,
  headingRef,
  onEdit,
  onRetry,
  onStartOver,
}: AiGenerationFailureProps) {
  const t = useT()
  const view = generationFailureView(failure, liveError, t)
  const editFirst = view.recovery !== 'retry'
  const canRetry = view.recovery !== 'edit'

  return (
    <section
      aria-labelledby="ai-failure-title"
      className="animate-fade-up space-y-4 rounded-panel border border-danger-line bg-panel bg-linear-to-br from-danger-soft to-transparent to-60% p-5 sm:p-6"
    >
      <h2
        id="ai-failure-title"
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-lg font-semibold text-cream-50 outline-none"
      >
        {t('ai.generationError.title')}
      </h2>
      <div role="alert" className="space-y-1">
        <p className="text-sm leading-relaxed text-danger">{view.message}</p>
        {view.hint ? <p className="text-sm text-cream-300">{view.hint}</p> : null}
      </div>
      {view.explainsSpotifyLimit ? <SpotifyLimitExplanation /> : null}
      <div className="flex flex-wrap gap-2">
        {editFirst ? (
          <Button type="button" onClick={onEdit}>
            <Pencil aria-hidden className="size-4" />
            {t('ai.editRequest')}
          </Button>
        ) : null}
        {canRetry ? (
          <Button type="button" variant={editFirst ? 'secondary' : 'default'} onClick={onRetry}>
            <RotateCcw aria-hidden className="size-4" />
            {t('common.retry')}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={onStartOver}>
          {t('ai.startOver')}
        </Button>
      </div>
    </section>
  )
}
