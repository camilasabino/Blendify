import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RotateCcw } from 'lucide-react'
import { api } from '@/lib/api'
import { UsageStatsView } from '@/components/playlist/usage-stats'
import { ErrorState, LoadingState } from '@/components/ui/feedback'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { useT } from '@/i18n/use-t'
import { isUsageStatsEmpty } from '@/lib/usage-stats'

export function StatsPage() {
  const t = useT()
  useDocumentTitle(t('nav.stats'))
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['usage-stats'],
    queryFn: () => api.getUsageStats(),
  })

  const resetMutation = useMutation({
    mutationFn: () => api.resetUsageStats(),
    onSuccess: async () => {
      setConfirmOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
  })

  const canReset = data != null && !isUsageStatsEmpty(data)

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          eyebrow={t('stats.eyebrow')}
          title={t('stats.title')}
          description={t('stats.subtitle')}
        />
        {canReset ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="shrink-0 self-start"
            disabled={resetMutation.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            <RotateCcw className="size-3.5" />
            {t('stats.reset')}
          </Button>
        ) : null}
      </div>

      {isLoading && <LoadingState label={t('stats.loading')} />}

      {isError && (
        <ErrorState
          message={t('stats.loadError')}
          retryLabel={t('common.retry')}
          onRetry={() => void refetch()}
        />
      )}

      {resetMutation.isError ? (
        <ErrorState message={t('stats.resetError')} />
      ) : null}

      {!isLoading && !isError && data && <UsageStatsView stats={data} />}

      <ConfirmDialog
        open={confirmOpen}
        title={t('stats.resetTitle')}
        description={t('stats.resetBody')}
        confirmLabel={t('stats.resetConfirm')}
        cancelLabel={t('common.cancel')}
        workingLabel={t('stats.resetWorking')}
        danger
        busy={resetMutation.isPending}
        onCancel={() => {
          if (resetMutation.isPending) return
          setConfirmOpen(false)
        }}
        onConfirm={() => resetMutation.mutate()}
      />
    </div>
  )
}
