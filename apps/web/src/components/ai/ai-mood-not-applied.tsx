import type { AiMood, AiMoodNotAppliedReason } from '@blendify/contracts'
import { useT } from '@/i18n/use-t'
import { cn } from '@/lib/utils'
import { MOOD_LABEL_KEYS, MOOD_NOT_APPLIED_REASON_KEYS } from './ai-copy'

type AiMoodNotAppliedProps = Readonly<{
  mood: AiMood
  reason: AiMoodNotAppliedReason
  heading?: 'h3' | 'h4'
  className?: string
}>

export function AiMoodNotApplied({
  mood,
  reason,
  heading: Heading = 'h3',
  className,
}: AiMoodNotAppliedProps) {
  const t = useT()

  return (
    <div className={cn('space-y-1.5 rounded-card border border-divider p-4', className)}>
      <Heading className="text-sm font-medium text-cream-100">{t('ai.moodNotApplied.title')}</Heading>
      <p className="text-sm text-cream-300">
        <span className="text-cream-400">{t('ai.summary.mood')}: </span>
        {t(MOOD_LABEL_KEYS[mood])}
      </p>
      <p className="text-sm text-cream-400">{t(MOOD_NOT_APPLIED_REASON_KEYS[reason])}</p>
    </div>
  )
}
