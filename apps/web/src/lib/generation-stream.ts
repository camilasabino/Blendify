import {
  GenerationStreamEventSchema,
  type GenerationProgress,
  type GenerationStreamEvent,
  type PlaylistDetail,
} from '@blendify/contracts'
import { ApiError } from '@/lib/api-error'

export type GenerationProgressHandler = (progress: GenerationProgress) => void

export async function readGenerationStream(
  response: Response,
  onProgress?: GenerationProgressHandler,
): Promise<PlaylistDetail> {
  if (!response.body) {
    throw new ApiError('Empty generation response', response.status)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let playlist: PlaylistDetail | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const event = parseGenerationStreamLine(line)
      if (!event) continue
      if (event.type === 'progress') {
        onProgress?.(event)
      } else if (event.type === 'result') {
        playlist = event.playlist
      } else if (event.type === 'error') {
        throw new ApiError(event.message, event.statusCode, event)
      }
    }
  }

  const trailing = parseGenerationStreamLine(buffer)
  if (trailing) {
    if (trailing.type === 'progress') {
      onProgress?.(trailing)
    } else if (trailing.type === 'result') {
      playlist = trailing.playlist
    } else if (trailing.type === 'error') {
      throw new ApiError(trailing.message, trailing.statusCode, trailing)
    }
  }

  if (!playlist) {
    throw new ApiError('Generation stream ended without a result', 502)
  }
  return playlist
}

export function parseGenerationStreamLine(
  line: string,
): GenerationStreamEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  const result = GenerationStreamEventSchema.safeParse(parsed)
  return result.success ? result.data : null
}
