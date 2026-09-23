export type PopoverAlign = 'start' | 'end'
export type PopoverSide = 'top' | 'bottom'
export type PopoverPlacement = `${PopoverSide}-${PopoverAlign}`

type Box = Readonly<{ top: number; bottom: number; left: number; right: number }>

export type PopoverPositionInput = Readonly<{
  trigger: Box
  anchor: Box
  panel: Readonly<{ width: number; height: number }>
  viewport: Readonly<{ width: number; height: number }>
  align: PopoverAlign
  offset?: number
  margin?: number
}>

export type PopoverPosition = Readonly<{
  top: number
  left: number
  maxHeight: number
  placement: PopoverPlacement
}>

export const POPOVER_OFFSET = 8
export const POPOVER_VIEWPORT_MARGIN = 8

export function computePopoverPosition({
  trigger,
  anchor,
  panel,
  viewport,
  align,
  offset = POPOVER_OFFSET,
  margin = POPOVER_VIEWPORT_MARGIN,
}: PopoverPositionInput): PopoverPosition {
  const spaceBelow = viewport.height - trigger.bottom - offset - margin
  const spaceAbove = trigger.top - offset - margin
  const side: PopoverSide =
    panel.height <= spaceBelow || spaceBelow >= spaceAbove ? 'bottom' : 'top'
  const maxHeight = Math.max(0, side === 'bottom' ? spaceBelow : spaceAbove)
  const height = Math.min(panel.height, maxHeight)

  const leftFor = (edge: PopoverAlign) =>
    edge === 'start' ? trigger.left : trigger.right - panel.width
  const fits = (left: number) =>
    left >= margin && left + panel.width <= viewport.width - margin
  const opposite: PopoverAlign = align === 'start' ? 'end' : 'start'
  const resolvedAlign =
    !fits(leftFor(align)) && fits(leftFor(opposite)) ? opposite : align

  const maxLeft = Math.max(margin, viewport.width - margin - panel.width)
  const left = Math.min(Math.max(leftFor(resolvedAlign), margin), maxLeft)
  const top =
    side === 'bottom' ? trigger.bottom + offset : trigger.top - offset - height

  return {
    top: top - anchor.top,
    left: left - anchor.left,
    maxHeight,
    placement: `${side}-${resolvedAlign}`,
  }
}
