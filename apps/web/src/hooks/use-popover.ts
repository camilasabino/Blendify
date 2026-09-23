import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useLocation } from 'react-router-dom'
import {
  computePopoverPosition,
  type PopoverAlign,
  type PopoverPosition,
} from '@/lib/popover-position'

export const popoverSurfaceClass =
  'absolute z-20 max-w-[calc(100vw-1rem)] overflow-y-auto border border-divider bg-raised shadow-xl shadow-charcoal-950/60'

export const POPOVER_ITEM_SELECTOR = '[data-popover-item]:not(:disabled)'

type UsePopoverOptions = Readonly<{
  align?: PopoverAlign
}>

export function usePopover<TPanel extends HTMLElement = HTMLDivElement>({
  align = 'end',
}: UsePopoverOptions = {}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<PopoverPosition | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<TPanel>(null)
  const { pathname } = useLocation()

  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  const toggle = useCallback(() => setOpen((value) => !value), [])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const isOutside = (target: EventTarget | null) =>
      !rootRef.current?.contains(target as Node)
    const onPointerDown = (event: PointerEvent) => {
      if (isOutside(event.target)) close(false)
    }
    const onFocusIn = (event: FocusEvent) => {
      if (isOutside(event.target)) close(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close(true)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, close])

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    const update = () => {
      const root = rootRef.current
      const trigger = triggerRef.current
      const panel = panelRef.current
      if (!root || !trigger || !panel) return
      setPosition(
        computePopoverPosition({
          trigger: trigger.getBoundingClientRect(),
          anchor: root.getBoundingClientRect(),
          panel: { width: panel.offsetWidth, height: panel.scrollHeight },
          viewport: {
            width: document.documentElement.clientWidth,
            height: window.innerHeight,
          },
          align,
        }),
      )
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    if (panelRef.current) observer?.observe(panelRef.current)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      observer?.disconnect()
    }
  }, [open, align])

  const panelStyle: CSSProperties = position
    ? { top: position.top, left: position.left, maxHeight: position.maxHeight }
    : { top: 0, left: 0 }

  const focusItem = useCallback((target: 'first' | 'last' | 'selected') => {
    const items = panelItems(panelRef.current)
    const selected = items.find(
      (item) => item.getAttribute('aria-checked') === 'true',
    )
    const next =
      (target === 'selected' ? selected : undefined) ??
      (target === 'last' ? items.at(-1) : items[0])
    next?.focus()
  }, [])

  const onPanelKeyDown = useCallback((event: ReactKeyboardEvent) => {
    const items = panelItems(panelRef.current)
    if (items.length === 0) return
    const current = items.indexOf(document.activeElement as HTMLElement)
    const nextIndex = {
      ArrowDown: (current + 1) % items.length,
      ArrowUp: (current - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    }[event.key]
    if (nextIndex === undefined) return
    event.preventDefault()
    items[nextIndex]?.focus()
  }, [])

  return {
    open,
    setOpen,
    toggle,
    close,
    rootRef,
    triggerRef,
    panelRef,
    panelStyle,
    placement: position?.placement,
    focusItem,
    onPanelKeyDown,
  }
}

function panelItems(panel: HTMLElement | null): HTMLElement[] {
  if (!panel) return []
  return Array.from(panel.querySelectorAll<HTMLElement>(POPOVER_ITEM_SELECTOR))
}
