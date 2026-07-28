import { useEffect, useMemo, useState } from 'react'

export function useSuggestionSeed<T extends { id: string }>(selected: T[]) {
  const lastId = selected.at(-1)?.id ?? null
  const [seedId, setSeedId] = useState<string | null>(lastId)

  useEffect(() => {
    if (!lastId) {
      setSeedId(null)
      return
    }

    const ids = new Set(selected.map((item) => item.id))
    setSeedId((prev) => {
      if (!prev || !ids.has(prev)) return lastId
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
