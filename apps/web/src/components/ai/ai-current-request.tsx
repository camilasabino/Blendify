import type { RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/use-t'

type AiCurrentRequestProps = Readonly<{
  prompt: string
  onEdit: () => void
  editButtonRef?: RefObject<HTMLButtonElement | null>
}>

export function AiCurrentRequest({ prompt, onEdit, editButtonRef }: AiCurrentRequestProps) {
  const t = useT()

  return (
    <section
      aria-labelledby="ai-current-request-title"
      className="space-y-3 rounded-panel border border-divider bg-panel p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id="ai-current-request-title" className="text-eyebrow text-cream-400">
            {t('ai.requestTitle')}
          </h2>
          <p className="break-words text-sm text-cream-50">“{prompt}”</p>
        </div>
        <Button ref={editButtonRef} variant="secondary" size="sm" onClick={onEdit}>
          {t('ai.editRequest')}
        </Button>
      </div>
    </section>
  )
}
