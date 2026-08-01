import { LibraryList } from '@/components/playlist/library-list'
import { PageHeader } from '@/components/ui/page-header'
import { useT } from '@/i18n/use-t'

export function LibraryPage() {
  const t = useT()

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 animate-fade-up">
      <PageHeader
        eyebrow={t('library.eyebrow')}
        title={t('library.title')}
        description={t('library.subtitle')}
      />
      <LibraryList />
    </div>
  )
}
