import { LibraryList } from '@/components/playlist/library-list'
import { PageHeader } from '@/components/ui/page-header'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { useT } from '@/i18n/use-t'

export function LibraryPage() {
  const t = useT()
  useDocumentTitle(t('nav.library'))

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
