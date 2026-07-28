import { useCallback } from 'react'
import { messages, type MessageKey } from './messages'
import { useLocaleStore } from './use-locale'

type Vars = Record<string, string | number>

export function useT() {
  const locale = useLocaleStore((s) => s.locale)

  return useCallback(
    (key: MessageKey, vars?: Vars): string => {
      let text: string = messages[locale][key] ?? messages.en[key] ?? key
      if (!vars) return text
      for (const [name, value] of Object.entries(vars)) {
        text = text.replaceAll(`{${name}}`, String(value))
      }
      return text
    },
    [locale],
  )
}
