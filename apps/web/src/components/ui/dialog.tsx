import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useT } from '@/i18n/use-t'
import { cn } from '@/lib/utils'

type DialogProps = Readonly<{
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
}>

function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: DialogProps) {
  const t = useT()
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open) {
      if (!dialog.open) dialog.showModal()
      const frame = window.requestAnimationFrame(() => {
        dialog
          .querySelector<HTMLElement>('button, [href], input')
          ?.focus()
      })
      return () => window.cancelAnimationFrame(frame)
    }

    if (dialog.open) dialog.close()
  }, [open])

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className={cn(
        'blendify-dialog w-full max-w-md rounded-2xl border border-cream-200/15 bg-charcoal-900 p-5 text-cream-50 shadow-[0_24px_80px_-24px_rgb(0_0_0_/_0.9)] open:animate-fade-up',
        className,
      )}
      onClose={() => {
        if (open) onClose()
      }}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div className="relative">
        <button
          type="button"
          aria-label={t('common.close')}
          className="sr-only"
          onClick={onClose}
        />
        <h2
          id={titleId}
          className="font-display text-lg tracking-tight text-cream-50"
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
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (busy) return
        onCancel()
      }}
      title={title}
    >
      <p className="text-sm leading-relaxed text-cream-300">{description}</p>
      {busy && workingLabel ? (
        <output
          className="mt-3 flex items-center gap-2 text-sm text-amber-400/90"
          aria-live="polite"
        >
          <Spinner size="sm" className="text-amber-400" />
          {workingLabel}
        </output>
      ) : null}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {cancelLabel ? (
          <Button
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
