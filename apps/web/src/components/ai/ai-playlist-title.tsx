import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { Pencil } from 'lucide-react'
import { PLAYLIST_NAME_MAX_LENGTH } from '@blendify/contracts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useT } from '@/i18n/use-t'

type AiPlaylistTitleProps = Readonly<{
  titleId: string
  title: string | null
  suggestedTitle: string
  onTitleChange: (title: string | null) => void
  headingRef: RefObject<HTMLHeadingElement | null>
  children: ReactNode
}>

export function AiPlaylistTitle({
  titleId,
  title,
  suggestedTitle,
  onTitleChange,
  headingRef,
  children,
}: AiPlaylistTitleProps) {
  const t = useT()
  const inputId = useId()
  const [isEditing, setIsEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(false)
  const displayTitle = title?.trim() || suggestedTitle

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
    } else if (wasEditing.current) {
      editButtonRef.current?.focus()
    }
    wasEditing.current = isEditing
  }, [isEditing])

  function restoreSuggestionIfEmpty() {
    if (title !== null && title.trim() === '') {
      onTitleChange(null)
    }
  }

  function finishEditing(event?: FormEvent) {
    event?.preventDefault()
    restoreSuggestionIfEmpty()
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div className="space-y-2">
        <form onSubmit={finishEditing} className="space-y-2">
          <Label htmlFor={inputId} id={titleId} className="text-xs text-cream-400">
            {t('ai.result.titleLabel')}
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              ref={inputRef}
              id={inputId}
              value={title ?? suggestedTitle}
              maxLength={PLAYLIST_NAME_MAX_LENGTH}
              onChange={(event) => onTitleChange(event.target.value)}
              onBlur={restoreSuggestionIfEmpty}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  finishEditing()
                }
              }}
            />
            <Button type="submit" variant="secondary" className="shrink-0">
              {t('ai.result.doneEditingTitle')}
            </Button>
          </div>
        </form>
        {children}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <h2
        id={titleId}
        ref={headingRef}
        tabIndex={-1}
        className="break-words font-display text-xl font-semibold text-cream-50 outline-none sm:text-2xl"
      >
        {displayTitle}
      </h2>
      {children}
      <Button
        ref={editButtonRef}
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-3"
        onClick={() => setIsEditing(true)}
      >
        <Pencil aria-hidden className="size-3.5" />
        {t('ai.result.editTitle')}
      </Button>
    </div>
  )
}
