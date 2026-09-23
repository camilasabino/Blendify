import { MixPlaylistForm } from '@/components/playlist/mix-playlist-form'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { useT } from '@/i18n/use-t'

export function MixPlaylistPage() {
  const t = useT()
  useDocumentTitle(t('nav.create'))
  return <MixPlaylistForm />
}
