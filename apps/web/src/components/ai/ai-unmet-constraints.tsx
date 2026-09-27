import type { AiGenerationUnmetConstraint } from '@blendify/contracts'
import { useT } from '@/i18n/use-t'
import { unmetConstraintView } from './ai-generation-copy'

export function AiUnmetConstraints({
  constraints,
}: Readonly<{ constraints: readonly AiGenerationUnmetConstraint[] }>) {
  const t = useT()

  if (constraints.length === 0) {
    return null
  }

  return (
    <section
      aria-labelledby="ai-unmet-title"
      className="space-y-2 rounded-card border border-divider bg-card p-4"
    >
      <h3 id="ai-unmet-title" className="text-sm font-medium text-cream-100">
        {t('ai.unmet.title')}
      </h3>
      <ul className="space-y-2 text-sm">
        {constraints.map((constraint) => {
          const view = unmetConstraintView(constraint, t)
          return (
            <li key={view.key} className="break-words">
              <span className="font-medium text-cream-200">{view.label}: </span>
              <span className="text-cream-300">{view.message}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
