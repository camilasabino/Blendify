import { useMemo, useState } from 'react'
import type { PlaylistDetail } from '@blendify/contracts'
import { copyToClipboard } from '@/lib/utils'

export function useCopiedLink() {
  const [copied, setCopied] = useState(false)

  async function copy(url: string) {
    if (!(await copyToClipboard(url))) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1_800)
  }

  return { copied, copy, reset: () => setCopied(false) }
}

export function useGenerationFill(
  result: PlaylistDetail | null,
  requestedTrackCount: number,
) {
  return useMemo(() => {
    const trackCount = result?.trackCount ?? 0
    const incomplete =
      requestedTrackCount > 0 &&
      trackCount > 0 &&
      trackCount < requestedTrackCount
    const fillRatio =
      requestedTrackCount > 0 ? trackCount / requestedTrackCount : 1
    return {
      isNearCompleteFill: incomplete && fillRatio >= 0.85,
      isShortFill: incomplete && fillRatio < 0.85,
    }
  }, [requestedTrackCount, result])
}
