import { useState } from 'react'
import type { AiCurrentPreservationDto } from '@blendify/contracts'

export type AiPositionChanges = { add: number[]; remove: number[] }

function lockedPositions(preservation: AiCurrentPreservationDto | null): ReadonlySet<number> {
  if (!preservation) {
    return new Set()
  }
  const explicit = new Set(preservation.positions)
  const firstTracks = Array.from(
    { length: preservation.firstTracks ?? 0 },
    (_, index) => index + 1,
  )
  return new Set([
    ...preservation.preservedPositions.filter((position) => !explicit.has(position)),
    ...firstTracks,
  ])
}

export function useAiRefinementDraft(preservation: AiCurrentPreservationDto | null) {
  const [isOpen, setIsOpen] = useState(false)
  const [text, setText] = useState('')
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set())
  const [validationError, setValidationError] = useState<string | null>(null)
  const explicit = preservation?.positions ?? []
  const locked = lockedPositions(preservation)

  function open() {
    setSelected(new Set(explicit))
    setValidationError(null)
    setIsOpen(true)
  }

  function close() {
    setValidationError(null)
    setIsOpen(false)
  }

  function changeText(next: string) {
    setText(next)
    setValidationError(null)
  }

  function toggle(position: number) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(position)) {
        next.delete(position)
      } else {
        next.add(position)
      }
      return next
    })
  }

  function positionChanges(): AiPositionChanges | undefined {
    const current = new Set(explicit)
    const add = [...selected].filter((position) => !current.has(position)).sort((a, b) => a - b)
    const remove = explicit.filter((position) => !selected.has(position))
    return add.length > 0 || remove.length > 0 ? { add, remove } : undefined
  }

  function reset() {
    setText('')
    setIsOpen(false)
    setValidationError(null)
  }

  return {
    isOpen,
    text,
    selected,
    locked,
    validationError,
    open,
    close,
    changeText,
    toggle,
    positionChanges,
    setValidationError,
    reset,
  }
}
