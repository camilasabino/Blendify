import { computePopoverPosition } from './popover-position'

const viewport = { width: 400, height: 800 }
const anchor = { top: 0, bottom: 0, left: 0, right: 0 }

function box(left: number, top: number, width = 36, height = 36) {
  return { left, top, right: left + width, bottom: top + height }
}

describe('computePopoverPosition', () => {
  it('opens below and aligned to the trigger end by default', () => {
    const position = computePopoverPosition({
      trigger: box(300, 10),
      anchor,
      panel: { width: 160, height: 120 },
      viewport,
      align: 'end',
    })

    expect(position).toEqual({
      top: 54,
      left: 176,
      maxHeight: 738,
      placement: 'bottom-end',
    })
  })

  it('flips above when there is not enough room below', () => {
    const position = computePopoverPosition({
      trigger: box(300, 740),
      anchor,
      panel: { width: 160, height: 150 },
      viewport,
      align: 'end',
    })

    expect(position.placement).toBe('top-end')
    expect(position.top).toBe(740 - 8 - 150)
  })

  it('switches to start alignment when end alignment would overflow the left edge', () => {
    const position = computePopoverPosition({
      trigger: box(20, 10),
      anchor,
      panel: { width: 200, height: 100 },
      viewport,
      align: 'end',
    })

    expect(position.placement).toBe('bottom-start')
    expect(position.left).toBe(20)
  })

  it('clamps inside the viewport gutters when neither alignment fits', () => {
    const position = computePopoverPosition({
      trigger: box(250, 10),
      anchor,
      panel: { width: 352, height: 100 },
      viewport: { width: 360, height: 800 },
      align: 'end',
    })

    expect(position.left).toBe(8)
  })

  it('returns coordinates relative to the anchor', () => {
    const position = computePopoverPosition({
      trigger: box(300, 410),
      anchor: { top: 400, bottom: 446, left: 200, right: 340 },
      panel: { width: 100, height: 80 },
      viewport,
      align: 'end',
    })

    expect(position.top).toBe(410 + 36 + 8 - 400)
    expect(position.left).toBe(336 - 100 - 200)
  })

  it('caps the height to the space on the chosen side', () => {
    const position = computePopoverPosition({
      trigger: box(100, 500),
      anchor,
      panel: { width: 100, height: 600 },
      viewport,
      align: 'start',
    })

    expect(position.placement).toBe('top-start')
    expect(position.maxHeight).toBe(500 - 8 - 8)
    expect(position.top).toBe(8)
  })
})
