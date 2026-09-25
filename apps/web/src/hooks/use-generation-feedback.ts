import { useMemo, useState } from 'react'
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
  trackCount: number,
  requestedTrackCount: number,
) {
  return useMemo(() => {
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
  }, [requestedTrackCount, trackCount])
}
