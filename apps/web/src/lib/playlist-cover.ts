export type PlaylistCoverKind = 'mix' | 'discover'

export type PlaylistCoverInput = {
  title: string
  kind?: PlaylistCoverKind
  /** Artist portraits or album art — used like Spotify Daily Mix. */
  imageUrls?: string[]
}

type CoverPalette = {
  bar: string
  barText: string
  mark: string
  fieldA: string
  fieldB: string
  fieldText: string
}

const COVER_SIZE = 640
const MAX_COVER_BYTES = 250 * 1024
const MAX_COVER_IMAGES = 4
const IMAGE_LOAD_TIMEOUT_MS = 5_000
const JPEG_QUALITIES = [0.92, 0.85, 0.75, 0.65, 0.55] as const

/**
 * Renders a 640×640 JPEG cover for Spotify (≤256 KB).
 * Tuned for thumbnail readability: bold type, solid bar, optional photos.
 */
export async function renderPlaylistCoverBase64(
  input: PlaylistCoverInput,
): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = COVER_SIZE
  canvas.height = COVER_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas unavailable')
  }

  try {
    await document.fonts.ready
  } catch {
    // Fall back to system fonts if loading fails.
  }

  const kind = input.kind ?? inferKind(input.title)
  const { eyebrow, headline } = splitTitle(input.title)
  const palette = pickPalette(kind, headline)
  const images = await loadCoverImages(input.imageUrls ?? [], MAX_COVER_IMAGES)

  const barH = Math.round(COVER_SIZE * 0.22)
  const artH = COVER_SIZE - barH

  if (images.length > 0) {
    paintPhotoField(ctx, COVER_SIZE, artH, images)
    paintPhotoScrim(ctx, COVER_SIZE, artH)
  } else {
    paintGraphicField(ctx, COVER_SIZE, artH, palette, headline)
  }

  paintBrandMark(ctx, palette)
  paintBottomBar(
    ctx,
    COVER_SIZE,
    barH,
    palette,
    kind,
    eyebrow,
    headline,
  )

  for (const quality of JPEG_QUALITIES) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '')
    const bytes = Math.ceil((base64.length * 3) / 4)
    if (bytes <= MAX_COVER_BYTES) return base64
  }

  return canvas
    .toDataURL('image/jpeg', 0.45)
    .replace(/^data:image\/jpeg;base64,/, '')
}

function inferKind(title: string): PlaylistCoverKind {
  return /discover/i.test(title) ? 'discover' : 'mix'
}

function splitTitle(raw: string): { eyebrow: string; headline: string } {
  const stripped = stripBrandPrefix(raw.trim()) || 'Untitled blend'
  const parts = stripped.split(/\s*[·•\-–—|:]\s*/).filter(Boolean)
  if (parts.length >= 2) {
    const maybeKind = parts[0].toLowerCase()
    if (maybeKind === 'mix' || maybeKind === 'discover') {
      return {
        eyebrow: parts[0].toUpperCase(),
        headline: parts.slice(1).join(' · '),
      }
    }
  }
  return { eyebrow: 'BLEND', headline: stripped }
}

function pickPalette(kind: PlaylistCoverKind, seed: string): CoverPalette {
  const palettes: CoverPalette[] =
    kind === 'discover'
      ? [
          {
            bar: '#f0b84a',
            barText: '#14110d',
            mark: '#f0b84a',
            fieldA: '#1a1410',
            fieldB: '#3d2a16',
            fieldText: '#f7f2ea',
          },
          {
            bar: '#f5efe4',
            barText: '#14110d',
            mark: '#f5efe4',
            fieldA: '#0f1f1a',
            fieldB: '#1f4a3a',
            fieldText: '#f5efe4',
          },
          {
            bar: '#e8a038',
            barText: '#14110d',
            mark: '#e8a038',
            fieldA: '#201810',
            fieldB: '#5a3a18',
            fieldText: '#fff6e8',
          },
        ]
      : [
          {
            bar: '#f0b84a',
            barText: '#14110d',
            mark: '#f0b84a',
            fieldA: '#12100e',
            fieldB: '#2c2116',
            fieldText: '#f7f2ea',
          },
          {
            bar: '#f5efe4',
            barText: '#14110d',
            mark: '#f5efe4',
            fieldA: '#171412',
            fieldB: '#45301a',
            fieldText: '#f5efe4',
          },
          {
            bar: '#d97706',
            barText: '#14110d',
            mark: '#fbbf24',
            fieldA: '#0c0b0a',
            fieldB: '#3f2812',
            fieldText: '#fef3c7',
          },
          {
            bar: '#34d399',
            barText: '#0a1210',
            mark: '#34d399',
            fieldA: '#0d1512',
            fieldB: '#1a3d30',
            fieldText: '#ecfdf5',
          },
        ]

  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return palettes[hash % palettes.length]!
}

async function loadCoverImages(
  urls: string[],
  max: number,
): Promise<HTMLImageElement[]> {
  const unique = [...new Set(urls.filter(Boolean))].slice(0, max)
  const loaded = await Promise.all(unique.map((url) => loadImage(url)))
  return loaded.filter((img): img is HTMLImageElement => Boolean(img))
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    let settled = false
    const finish = (value: HTMLImageElement | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      resolve(value)
    }
    const timeout = window.setTimeout(
      () => finish(null),
      IMAGE_LOAD_TIMEOUT_MS,
    )
    img.crossOrigin = 'anonymous'
    img.onload = () => finish(img)
    img.onerror = () => finish(null)
    img.src = url
  })
}

function paintPhotoField(
  ctx: CanvasRenderingContext2D,
  size: number,
  artH: number,
  images: HTMLImageElement[],
): void {
  const count = Math.min(images.length, 4)
  if (count === 1) {
    drawCoverImage(ctx, images[0]!, 0, 0, size, artH)
    return
  }
  if (count === 2) {
    const w = size / 2
    drawCoverImage(ctx, images[0]!, 0, 0, w, artH)
    drawCoverImage(ctx, images[1]!, w, 0, w, artH)
    return
  }
  if (count === 3) {
    const half = size / 2
    drawCoverImage(ctx, images[0]!, 0, 0, half, artH)
    drawCoverImage(ctx, images[1]!, half, 0, half, artH / 2)
    drawCoverImage(ctx, images[2]!, half, artH / 2, half, artH / 2)
    return
  }
  const half = size / 2
  const cellH = artH / 2
  drawCoverImage(ctx, images[0]!, 0, 0, half, cellH)
  drawCoverImage(ctx, images[1]!, half, 0, half, cellH)
  drawCoverImage(ctx, images[2]!, 0, cellH, half, cellH)
  drawCoverImage(ctx, images[3]!, half, cellH, half, cellH)
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  const dx = x + (w - dw) / 2
  const dy = y + (h - dh) / 2
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.drawImage(img, dx, dy, dw, dh)
  ctx.restore()
}

function paintPhotoScrim(
  ctx: CanvasRenderingContext2D,
  size: number,
  artH: number,
): void {
  const scrim = ctx.createLinearGradient(0, artH * 0.45, 0, artH)
  scrim.addColorStop(0, 'rgba(0,0,0,0)')
  scrim.addColorStop(1, 'rgba(0,0,0,0.35)')
  ctx.fillStyle = scrim
  ctx.fillRect(0, 0, size, artH)
}

function paintGraphicField(
  ctx: CanvasRenderingContext2D,
  size: number,
  artH: number,
  palette: CoverPalette,
  headline: string,
): void {
  const grad = ctx.createLinearGradient(0, 0, size, artH)
  grad.addColorStop(0, palette.fieldA)
  grad.addColorStop(1, palette.fieldB)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, artH)

  // Bold diagonal slab for structure (readable at small sizes).
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.beginPath()
  ctx.moveTo(size * 0.35, 0)
  ctx.lineTo(size, 0)
  ctx.lineTo(size, artH * 0.72)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = `${palette.mark}33`
  ctx.beginPath()
  ctx.arc(size * 0.78, artH * 0.28, size * 0.28, 0, Math.PI * 2)
  ctx.fill()

  // Giant initial — acts as visual anchor when there is no photo.
  const initial = (headline.trim()[0] || 'B').toUpperCase()
  ctx.fillStyle = `${palette.fieldText}18`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.font = `800 ${Math.round(size * 0.72)}px Syne, "DM Sans", ui-sans-serif, system-ui, sans-serif`
  ctx.fillText(initial, size - 18, artH + 24)
}

function paintBrandMark(
  ctx: CanvasRenderingContext2D,
  palette: CoverPalette,
): void {
  const display = 'Syne, "DM Sans", ui-sans-serif, system-ui, sans-serif'
  // Solid chip — high contrast like Spotify’s corner mark.
  const padX = 14
  ctx.font = `800 18px ${display}`
  const label = 'BLENDIFY'
  const textW = ctx.measureText(label).width
  const chipW = textW + padX * 2
  const chipH = 36
  const x = 28
  const y = 28

  roundRect(ctx, x, y, chipW, chipH, 8)
  ctx.fillStyle = palette.mark
  ctx.fill()

  ctx.fillStyle = '#14110d'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x + padX, y + chipH / 2 + 1)
}

function paintBottomBar(
  ctx: CanvasRenderingContext2D,
  size: number,
  barH: number,
  palette: CoverPalette,
  kind: PlaylistCoverKind,
  eyebrow: string,
  headline: string,
): void {
  const display = 'Syne, "DM Sans", ui-sans-serif, system-ui, sans-serif'
  const body = '"DM Sans", ui-sans-serif, system-ui, sans-serif'
  const y0 = size - barH

  ctx.fillStyle = palette.bar
  ctx.fillRect(0, y0, size, barH)

  const kindLabel = (kind === 'discover' ? 'DISCOVER' : eyebrow || 'MIX')
    .toUpperCase()
    .slice(0, 12)

  ctx.fillStyle = `${palette.barText}aa`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `800 15px ${body}`
  ctx.fillText(kindLabel, 28, y0 + 26)

  const fontSize =
    headline.length > 32 ? 26 : headline.length > 22 ? 32 : headline.length > 14 ? 38 : 44
  ctx.fillStyle = palette.barText
  ctx.font = `800 ${fontSize}px ${display}`
  const lines = wrapText(ctx, headline, size - 56, 2)
  const lineHeight = fontSize * 1.02
  const blockH = lines.length * lineHeight
  let titleY = y0 + barH - 22 - blockH + fontSize
  for (const line of lines) {
    ctx.fillText(line, 28, titleY)
    titleY += lineHeight
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
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
  let current = words[0]!

  for (let i = 1; i < words.length; i++) {
    const next = `${current} ${words[i]}`
    if (ctx.measureText(next).width <= maxWidth) {
      current = next
      continue
    }
    lines.push(current)
    current = words[i]!
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
