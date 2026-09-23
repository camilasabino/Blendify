import { DiscoverPlaylistForm } from '@/components/playlist/discover-playlist-form'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { useT } from '@/i18n/use-t'

export function DiscoverPlaylistPage() {
  const t = useT()
  useDocumentTitle(t('nav.discover'))
  return <DiscoverPlaylistForm />
}
