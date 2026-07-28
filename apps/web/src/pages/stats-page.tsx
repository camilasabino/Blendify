import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { HistoryStats } from '@/components/playlist/history-stats'
import { ErrorState, LoadingState } from '@/components/ui/feedback'
import { PageHeader } from '@/components/ui/page-header'
import { useT } from '@/i18n/use-t'

export function StatsPage() {
  const t = useT()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['playlists', 'stats'],
    queryFn: () =>
      api.listPlaylists({ sync: false, limit: 500, offset: 0 }),
  })

  const playlists = data?.playlists ?? []

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 animate-fade-up">
      <PageHeader
        eyebrow={t('stats.eyebrow')}
        title={t('stats.title')}
        description={t('stats.subtitle')}
      />

      {isLoading && <LoadingState label={t('history.loading')} />}

      {isError && (
        <ErrorState
          message={t('history.loadError')}
          retryLabel={t('history.retry')}
          onRetry={() => void refetch()}
        />
      )}

      {!isLoading && !isError && <HistoryStats playlists={playlists} />}
    </div>
  )
}
