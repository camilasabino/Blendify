import { useEffect, useRef, useState } from 'react'

function scrollIntoViewRespectingMotion(element: HTMLElement | null) {
  if (!element || typeof element.scrollIntoView !== 'function') return
  const prefersReducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  element.scrollIntoView({
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
    block: 'start',
  })
}

/**
 * Tracks whether the generation settings form is collapsed. The form collapses
 * while a playlist is being created and once it is ready, so the result panel
 * becomes the focus; the user can expand it again to review or edit.
 */
export function useGenerationSettingsCollapse(
  isGenerating: boolean,
  hasResult: boolean,
) {
  const [settingsExpanded, setSettingsExpanded] = useState(false)
  const [wasGenerating, setWasGenerating] = useState(isGenerating)
  const resultPanelRef = useRef<HTMLDivElement>(null)
  const isActive = isGenerating || hasResult

  // Collapse again whenever a new generation starts.
  if (isGenerating !== wasGenerating) {
    setWasGenerating(isGenerating)
    if (isGenerating) setSettingsExpanded(false)
  }

  useEffect(() => {
    if (isGenerating) scrollIntoViewRespectingMotion(resultPanelRef.current)
  }, [isGenerating])

  return {
    resultPanelRef,
    isActive,
    collapsed: isActive && !settingsExpanded,
    toggleSettings: () => setSettingsExpanded((expanded) => !expanded),
  }
}
