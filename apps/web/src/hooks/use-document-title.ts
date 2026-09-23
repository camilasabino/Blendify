import { useEffect } from 'react'
import { DOCUMENT_TITLE, useLocaleStore } from '@/i18n/use-locale'

export function useDocumentTitle(pageTitle: string) {
  useEffect(() => {
    document.title = `${pageTitle} · Blendify`
    return () => {
      document.title = DOCUMENT_TITLE[useLocaleStore.getState().locale]
    }
  }, [pageTitle])
}
