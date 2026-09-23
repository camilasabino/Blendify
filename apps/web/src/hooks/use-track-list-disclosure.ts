import { useState } from 'react'

export const TRACK_PREVIEW_LIMIT = 10

export function useTrackListDisclosure<T>(
  items: readonly T[],
  limit = TRACK_PREVIEW_LIMIT,
) {
  const [expanded, setExpanded] = useState(false)
  const collapsible = items.length > limit
  const visible = collapsible && !expanded ? items.slice(0, limit) : items
  return {
    visible,
    collapsible,
    expanded,
    toggle: () => setExpanded((value) => !value),
  }
}
