import { LibraryList } from '@/components/playlist/library-list'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { useT } from '@/i18n/use-t'

export function LibraryPage() {
  const t = useT()
  useDocumentTitle(t('nav.library'))

  return (
    <PageContainer>
      <PageHeader
        eyebrow={t('library.eyebrow')}
        title={t('library.title')}
        description={t('library.subtitle')}
      />
      <LibraryList />
    </PageContainer>
  )
}
