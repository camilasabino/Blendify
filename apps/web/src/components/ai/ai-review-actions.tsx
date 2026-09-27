import { useId } from 'react'
import { ListMusic } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/use-t'

type AiReviewActionsProps = Readonly<{
  requestError: string | null
  onCreate: () => void
  onStartOver: () => void
}>

export function AiReviewActions({
  requestError,
  onCreate,
  onStartOver,
}: AiReviewActionsProps) {
  const t = useT()
  const hintId = useId()

  return (
    <div className="space-y-3 border-t border-divider pt-5">
      {requestError ? (
        <p role="alert" className="text-sm leading-relaxed text-danger">
          {requestError}
        </p>
      ) : null}
      <p id={hintId} className="text-sm text-cream-400">
        {t('ai.createHint')}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Button
          type="button"
          size="lg"
          className="w-full sm:w-auto"
          aria-describedby={hintId}
          onClick={onCreate}
        >
          <ListMusic aria-hidden className="size-4" />
          {t('ai.createPlaylist')}
        </Button>
        <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={onStartOver}>
          {t('ai.startOver')}
        </Button>
      </div>
    </div>
  )
}
