import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

type DialogProps = Readonly<{
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
  initialFocusRef?: RefObject<HTMLElement | null>
  dismissible?: boolean
}>

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

function Dialog({
  open,
  onClose,
  title,
  children,
  className,
  initialFocusRef,
  dismissible = true,
}: DialogProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !open) return

    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    if (!dialog.open) dialog.showModal()
    const frame = window.requestAnimationFrame(() => {
      const target =
        initialFocusRef?.current ??
        dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      target?.focus()
    })

    return () => {
      window.cancelAnimationFrame(frame)
      if (dialog.open) dialog.close()
      if (trigger?.isConnected) trigger.focus()
    }
  }, [open, initialFocusRef])

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className={cn(
        'blendify-dialog w-full max-w-md rounded-panel border border-divider bg-raised p-5 text-cream-50 shadow-[0_24px_80px_-24px_rgb(0_0_0_/_0.9)] open:animate-fade-up',
        className,
      )}
      closedby={dismissible ? 'closerequest' : 'none'}
      onCancel={(event) => {
        event.preventDefault()
        if (dismissible) onClose()
      }}
      onClose={(event) => {
        if (!open) return
        if (dismissible) {
          onClose()
          return
        }
        const dialog = event.currentTarget
        if (!dialog.open) dialog.showModal()
      }}
    >
      <div className="relative">
        <h2
          id={titleId}
          className="font-display text-lg font-semibold tracking-tight text-cream-50"
        >
          {title}
        </h2>
        <div className="mt-3">{children}</div>
      </div>
    </dialog>,
    document.body,
  )
}

export type ConfirmDialogProps = Readonly<{
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  workingLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}>

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  workingLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  return (
    <Dialog
      open={open}
      dismissible={!busy}
      initialFocusRef={danger && cancelLabel ? cancelRef : confirmRef}
      onClose={() => {
        if (busy) return
        onCancel()
      }}
      title={title}
    >
      <p className="text-sm leading-relaxed text-cream-300">{description}</p>
      {busy && workingLabel ? (
        <output
          className="mt-3 flex items-center gap-2 text-sm text-accent-fg"
          aria-live="polite"
        >
          <Spinner size="sm" />
          {workingLabel}
        </output>
      ) : null}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {cancelLabel ? (
          <Button
            ref={cancelRef}
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
        ) : null}
        <Button
          ref={confirmRef}
          type="button"
          size="sm"
          variant={danger ? 'danger' : 'default'}
          loading={busy}
          disabled={busy}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  )
}
