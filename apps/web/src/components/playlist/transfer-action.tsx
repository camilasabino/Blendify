import { useEffect, useId, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ArrowRightLeft, ExternalLink, RotateCcw } from 'lucide-react'
import type { PlaylistTransferOfferDto } from '@blendify/contracts'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  api,
  getTransferErrorMessage,
  getTransferErrorRecovery,
} from '@/lib/api'
import { useLocaleStore } from '@/i18n/use-locale'
import { useT } from '@/i18n/use-t'
import { cn, formatDateTime, toSafeHttpsUrl } from '@/lib/utils'

function TransferFailure({
  error,
  onRetry,
  onRegenerate,
}: Readonly<{
  error: unknown
  onRetry: () => void
  onRegenerate: () => void
}>) {
  const t = useT()
  const recovery = getTransferErrorRecovery(error)
  return (
    <div className="space-y-3">
      <p role="alert" className="text-sm leading-relaxed text-danger">
        {getTransferErrorMessage(error, t)}
      </p>
      {recovery === 'regenerate' ? (
        <Button type="button" variant="secondary" size="sm" onClick={onRegenerate}>
          <RotateCcw aria-hidden className="size-3.5" />
          {t('transfer.regenerate')}
        </Button>
      ) : null}
      {recovery === 'retry' ? (
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          <RotateCcw aria-hidden className="size-3.5" />
          {t('common.retry')}
        </Button>
      ) : null}
    </div>
  )
}

export function TransferAction({
  offer,
  onRegenerate,
}: Readonly<{
  offer: PlaylistTransferOfferDto
  onRegenerate: () => void
}>) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const titleId = useId()
  const explainerId = useId()
  const continueRef = useRef<HTMLAnchorElement>(null)
  const transferMutation = useMutation({
    mutationFn: () => api.createTransfer(offer.token),
  })
  const transfer = transferMutation.data
  const continueUrl = toSafeHttpsUrl(transfer?.url)

  useEffect(() => {
    if (continueUrl) continueRef.current?.focus()
  }, [continueUrl])

  return (
    <section
      aria-labelledby={titleId}
      className="space-y-3 rounded-card border border-divider bg-card p-4"
    >
      <h3
        id={titleId}
        className="font-display text-sm font-semibold text-cream-50"
      >
        {t('transfer.title')}
      </h3>
      <p id={explainerId} className="text-sm leading-relaxed text-cream-300">
        {t('transfer.explainer')}
      </p>

      {transfer && continueUrl ? (
        <div className="space-y-3">
          <output className="block text-xs text-cream-400">
            {t('transfer.ready', {
              count: transfer.trackCount,
              expires: formatDateTime(transfer.expiresAt, locale),
            })}
          </output>
          <a
            ref={continueRef}
            href={continueUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-describedby={explainerId}
            className={cn(buttonVariants(), 'w-full sm:w-auto')}
          >
            <ExternalLink aria-hidden className="size-4" />
            {t('transfer.continue')}{' '}
            <span className="sr-only">{t('common.opensNewTab')}</span>
          </a>
        </div>
      ) : null}

      {transfer && !continueUrl ? (
        <p role="alert" className="text-sm text-danger">
          {t('transfer.failed')}
        </p>
      ) : null}

      {transfer || transferMutation.isError ? null : (
        <Button
          type="button"
          className="w-full sm:w-auto"
          loading={transferMutation.isPending}
          aria-describedby={explainerId}
          onClick={() => transferMutation.mutate()}
        >
          {transferMutation.isPending ? null : (
            <ArrowRightLeft aria-hidden className="size-4" />
          )}
          {transferMutation.isPending
            ? t('transfer.preparing')
            : t('transfer.prepare')}
        </Button>
      )}

      {transferMutation.isError ? (
        <TransferFailure
          error={transferMutation.error}
          onRetry={() => transferMutation.mutate()}
          onRegenerate={onRegenerate}
        />
      ) : null}
    </section>
  )
}
