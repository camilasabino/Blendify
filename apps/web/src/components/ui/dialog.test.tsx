import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from './dialog'

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function showModal(
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close ??= function close(
    this: HTMLDialogElement,
  ) {
    if (!this.hasAttribute('open')) return
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

function Example({ danger }: Readonly<{ danger: boolean }>) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <ConfirmDialog
        open={open}
        title="Remove playlist?"
        description="This cannot be undone."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        danger={danger}
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}

describe('ConfirmDialog', () => {
  it('focuses Cancel first for destructive actions and restores focus', async () => {
    const user = userEvent.setup()
    render(<Example danger />)

    const trigger = screen.getByRole('button', { name: 'Open' })
    await user.click(trigger)

    const cancel = await screen.findByRole('button', { name: 'Cancel' })
    await waitFor(() => expect(cancel).toHaveFocus())

    await user.click(cancel)
    expect(trigger).toHaveFocus()
  })

  it('focuses the confirm action for non-destructive dialogs', async () => {
    const user = userEvent.setup()
    render(<Example danger={false} />)

    await user.click(screen.getByRole('button', { name: 'Open' }))

    const confirm = await screen.findByRole('button', { name: 'Remove' })
    await waitFor(() => expect(confirm).toHaveFocus())
  })
})

describe('ConfirmDialog while busy', () => {
  function renderBusy(busy: boolean) {
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        open
        title="Remove playlist?"
        description="This cannot be undone."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        danger
        busy={busy}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    )
    const dialog = document.querySelector('dialog')!
    return { dialog, onCancel }
  }

  it('blocks close requests at the dialog boundary', () => {
    const { dialog, onCancel } = renderBusy(true)

    expect(dialog).toHaveAttribute('closedby', 'none')
    for (let press = 0; press < 3; press += 1) {
      const cancel = new Event('cancel', { cancelable: true })
      fireEvent(dialog, cancel)
      expect(cancel.defaultPrevented).toBe(true)
    }

    expect(onCancel).not.toHaveBeenCalled()
    expect(dialog).toHaveAttribute('open')
  })

  it('reopens when the browser closes it without a cancelable request', () => {
    const { dialog, onCancel } = renderBusy(true)

    dialog.close()

    expect(onCancel).not.toHaveBeenCalled()
    expect(dialog).toHaveAttribute('open')
  })

  it('survives dismissibility changes while it stays mounted', () => {
    const onCancel = vi.fn()
    const view = (busy: boolean) => (
      <ConfirmDialog
        open
        title="Remove playlist?"
        description="This cannot be undone."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        danger
        busy={busy}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    )
    const { rerender } = render(view(false))
    const dialog = document.querySelector('dialog')!
    expect(dialog).toHaveAttribute('closedby', 'closerequest')

    rerender(view(true))

    expect(onCancel).not.toHaveBeenCalled()
    expect(dialog).toHaveAttribute('open')
    expect(dialog).toHaveAttribute('closedby', 'none')

    const cancel = new Event('cancel', { cancelable: true })
    fireEvent(dialog, cancel)
    expect(cancel.defaultPrevented).toBe(true)
    expect(onCancel).not.toHaveBeenCalled()
    expect(dialog).toHaveAttribute('open')

    rerender(view(false))

    expect(onCancel).not.toHaveBeenCalled()
    expect(dialog).toHaveAttribute('open')
    expect(dialog).toHaveAttribute('closedby', 'closerequest')
  })

  it('lets Escape dismiss the dialog when it is not busy', () => {
    const { dialog, onCancel } = renderBusy(false)

    expect(dialog).toHaveAttribute('closedby', 'closerequest')
    fireEvent(dialog, new Event('cancel', { cancelable: true }))

    expect(onCancel).toHaveBeenCalledOnce()
  })
})
