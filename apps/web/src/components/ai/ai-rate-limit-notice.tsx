import type { ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/use-t'
import { formatWaitLabel, type ApiError } from '@/lib/api-error'
import { aiRateLimitMessage } from './ai-copy'

type AiRateLimitNoticeProps = Readonly<{
  error: ApiError
  children?: ReactNode
}>

export function AiRateLimitNotice({ error, children }: AiRateLimitNoticeProps) {
  const t = useT()

  return (
    <div className="space-y-3 rounded-card border border-divider bg-card p-4">
      <div role="alert" className="space-y-1">
        <p className="text-sm font-semibold text-cream-50">{t('ai.error.paused.title')}</p>
        <p className="text-sm leading-relaxed text-cream-300">{aiRateLimitMessage(error, t)}</p>
      </div>
      {children}
    </div>
  )
}

type AiRateLimitRetryButtonProps = Readonly<{
  waitSeconds: number | null
  onRetry: () => void
}>

export function AiRateLimitRetryButton({ waitSeconds, onRetry }: AiRateLimitRetryButtonProps) {
  const t = useT()
  const wait = formatWaitLabel(t, waitSeconds)

  return (
    <Button type="button" size="sm" variant="secondary" disabled={wait !== null} onClick={onRetry}>
      <RotateCcw aria-hidden className="size-3.5" />
      {wait ? t('ai.error.paused.retryIn', { wait }) : t('common.retry')}
    </Button>
  )
}
