import {
  GenerationStreamEventSchema,
  type GenerationProgress,
  type GenerationStreamEvent,
  type PlaylistDetail,
} from '@blendify/contracts'
import { ApiError } from '@/lib/api-error'

export type GenerationProgressHandler = (progress: GenerationProgress) => void

type StreamAccumulator = {
  playlist: PlaylistDetail | null
}

function applyGenerationEvent(
  event: GenerationStreamEvent,
  onProgress: GenerationProgressHandler | undefined,
  state: StreamAccumulator,
): void {
  if (event.type === 'progress') {
    onProgress?.(event)
    return
  }
  if (event.type === 'result') {
    state.playlist = event.playlist
    return
  }
  throw new ApiError(event.message, event.statusCode, event)
}

function consumeGenerationLines(
  lines: string[],
  onProgress: GenerationProgressHandler | undefined,
  state: StreamAccumulator,
): void {
  for (const line of lines) {
    const event = parseGenerationStreamLine(line)
    if (event) applyGenerationEvent(event, onProgress, state)
  }
}

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
  const state: StreamAccumulator = { playlist: null }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    consumeGenerationLines(lines, onProgress, state)
  }

  consumeGenerationLines([buffer], onProgress, state)

  if (!state.playlist) {
    throw new ApiError('Generation stream ended without a result', 502)
  }
  return state.playlist
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
