import { HistoryList } from '@/components/playlist/history-list'
import { PageHeader } from '@/components/ui/page-header'
import { useT } from '@/i18n/use-t'

export function HistoryPage() {
  const t = useT()

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 animate-fade-up">
      <PageHeader
        eyebrow={t('history.eyebrow')}
        title={t('history.title')}
        description={t('history.subtitle')}
      />
      <HistoryList />
    </div>
  )
}
