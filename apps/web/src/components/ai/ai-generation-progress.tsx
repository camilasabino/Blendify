import type { RefObject } from 'react'
import type { GenerationProgress } from '@blendify/contracts'
import { phaseMessageKey } from '@/components/playlist/generation-result-helpers'
import { GenerationProgressBar } from '@/components/playlist/generation-result-panel'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/use-t'

type AiGenerationProgressProps = Readonly<{
  progress: GenerationProgress | null
  isStalled: boolean
  onCheckAgain: () => void
  headingRef: RefObject<HTMLHeadingElement | null>
}>

export function AiGenerationProgress({
  progress,
  isStalled,
  onCheckAgain,
  headingRef,
}: AiGenerationProgressProps) {
  const t = useT()
  const stageLabel = progress ? t(phaseMessageKey(progress.phase)) : t('ai.generating.hint')

  return (
    <section
      aria-labelledby="ai-generation-title"
      aria-busy={!isStalled}
      className="animate-fade-up space-y-4 rounded-panel border border-accent-line/50 bg-panel bg-linear-to-br from-amber-500/[0.12] to-transparent to-60% p-5 sm:p-6"
    >
      <h2
        id="ai-generation-title"
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-lg font-semibold text-cream-50 outline-none"
      >
        {t('ai.generating.title')}
      </h2>
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-sm font-medium text-cream-200">{stageLabel}</p>
          {progress ? (
            <span className="shrink-0 text-xs font-medium tabular-nums text-accent-fg">
              {progress.percent}%
            </span>
          ) : null}
        </div>
        <GenerationProgressBar progress={progress} progressLabel={stageLabel} />
      </div>
      <output className="sr-only">{isStalled ? t('ai.generating.stalled') : stageLabel}</output>
      {isStalled ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-cream-300">{t('ai.generating.stalled')}</p>
          <Button type="button" variant="secondary" size="sm" onClick={onCheckAgain}>
            {t('ai.generating.checkAgain')}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
