export type PlaylistCoverInput = {
  title: string
}

export async function renderPlaylistCoverBase64(
  input: PlaylistCoverInput,
): Promise<string> {
  const size = 640
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas unavailable')
  }

  const bg = ctx.createLinearGradient(0, 0, size, size)
  bg.addColorStop(0, '#1a1714')
  bg.addColorStop(0.55, '#2a2218')
  bg.addColorStop(1, '#3d2e1a')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, size, size)

  const orb = ctx.createRadialGradient(480, 140, 20, 480, 140, 280)
  orb.addColorStop(0, 'rgba(245, 158, 11, 0.35)')
  orb.addColorStop(1, 'rgba(245, 158, 11, 0)')
  ctx.fillStyle = orb
  ctx.fillRect(0, 0, size, size)

  ctx.strokeStyle = 'rgba(245, 240, 232, 0.04)'
  ctx.lineWidth = 1
  for (let y = 40; y < size; y += 18) {
    ctx.beginPath()
    ctx.moveTo(40, y)
    ctx.lineTo(size - 40, y)
    ctx.stroke()
  }

  ctx.fillStyle = 'rgba(245, 158, 11, 0.95)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '600 22px Syne, "DM Sans", ui-sans-serif, system-ui, sans-serif'
  ctx.fillText('Blendify', size / 2, size / 2 - 72)

  ctx.fillStyle = '#f5f0e8'
  ctx.font = '700 44px Syne, "DM Sans", ui-sans-serif, system-ui, sans-serif'
  const titleLines = wrapText(
    ctx,
    stripBrandPrefix(input.title.trim()) || 'Untitled blend',
    size - 96,
    4,
  )
  const lineHeight = 54
  const blockHeight = titleLines.length * lineHeight
  let titleY = size / 2 - blockHeight / 2 + lineHeight / 2 + 12
  for (const line of titleLines) {
    ctx.fillText(line, size / 2, titleY)
    titleY += lineHeight
  }

  const maxBytes = 250 * 1024
  for (const quality of [0.92, 0.85, 0.75, 0.65, 0.55]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '')
    const bytes = Math.ceil((base64.length * 3) / 4)
    if (bytes <= maxBytes) return base64
  }

  return canvas
    .toDataURL('image/jpeg', 0.45)
    .replace(/^data:image\/jpeg;base64,/, '')
}

function stripBrandPrefix(title: string): string {
  return title.replace(/^Blendify\s*[·•\-–—|:]\s*/i, '').trim()
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']

  const lines: string[] = []
  let current = words[0]

  for (let i = 1; i < words.length; i++) {
    const next = `${current} ${words[i]}`
    if (ctx.measureText(next).width <= maxWidth) {
      current = next
      continue
    }
    lines.push(current)
    current = words[i]
    if (lines.length === maxLines - 1) {
      const rest = [current, ...words.slice(i + 1)].join(' ')
      lines.push(truncateToWidth(ctx, rest, maxWidth))
      return lines
    }
  }
  lines.push(current)
  return lines.slice(0, maxLines)
}

function truncateToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let cut = text
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1)
  }
  return `${cut}…`
}
