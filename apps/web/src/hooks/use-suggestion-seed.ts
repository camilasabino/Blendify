import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Tracks which selected item drives “more like…” suggestions.
 * Defaults to the latest selection; manual overrides stick until
 * the tip of the selection list changes (add / remove last).
 */
export function useSuggestionSeed<T extends { id: string }>(selected: T[]) {
  const lastId = selected.at(-1)?.id ?? null
  const [seedId, setSeedId] = useState<string | null>(lastId)
  const prevLastIdRef = useRef<string | null>(lastId)

  useEffect(() => {
    if (!lastId) {
      setSeedId(null)
      prevLastIdRef.current = null
      return
    }

    const ids = new Set(selected.map((item) => item.id))
    const lastIdChanged = prevLastIdRef.current !== lastId
    prevLastIdRef.current = lastId

    setSeedId((prev) => {
      if (!prev || !ids.has(prev)) return lastId
      if (lastIdChanged) return lastId
      return prev
    })
  }, [selected, lastId])

  const seed = useMemo(
    () =>
      selected.find((item) => item.id === seedId) ?? selected.at(-1) ?? null,
    [selected, seedId],
  )

  return { seed, setSeedId }
}
