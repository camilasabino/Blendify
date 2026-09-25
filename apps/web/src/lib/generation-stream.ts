import type { z } from 'zod'
import type { ApiErrorResponse, GenerationProgress } from '@blendify/contracts'
import { ApiError, invalidGenerationResponseError } from '@/lib/api-error'

export type GenerationProgressHandler = (progress: GenerationProgress) => void

export type GenerationStreamEventOf<T> =
  | (GenerationProgress & { type: 'progress' })
  | { type: 'result'; playlist: T }
  | (ApiErrorResponse & { type: 'error' })

export type GenerationContract<T> = {
  events: z.ZodType<GenerationStreamEventOf<T>>
  result: z.ZodType<T>
}

function isResultEnvelope(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'result'
  )
}

export function parseGenerationStreamLine<T>(
  line: string,
  schema: z.ZodType<GenerationStreamEventOf<T>>,
): GenerationStreamEventOf<T> | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  const result = schema.safeParse(parsed)
  if (result.success) return result.data
  if (isResultEnvelope(parsed)) throw invalidGenerationResponseError()
  return null
}

type TerminalResult<T> = { playlist: T } | null

function consumeGenerationLines<T>(
  lines: string[],
  schema: z.ZodType<GenerationStreamEventOf<T>>,
  onProgress: GenerationProgressHandler | undefined,
): TerminalResult<T> {
  for (const line of lines) {
    const event = parseGenerationStreamLine(line, schema)
    if (!event) continue
    if (event.type === 'progress') {
      onProgress?.(event)
      continue
    }
    if (event.type === 'result') return { playlist: event.playlist }
    throw new ApiError(event.message, event.statusCode, event)
  }
  return null
}

export async function readGenerationStream<T>(
  response: Response,
  schema: z.ZodType<GenerationStreamEventOf<T>>,
  onProgress?: GenerationProgressHandler,
): Promise<T> {
  if (!response.body) {
    throw new ApiError('Empty generation response', response.status)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    const terminal = consumeGenerationLines(lines, schema, onProgress)
    if (terminal) {
      void reader.cancel().catch(() => undefined)
      return terminal.playlist
    }
  }

  const terminal = consumeGenerationLines([buffer], schema, onProgress)
  if (!terminal) {
    throw new ApiError('Generation stream ended without a result', 502)
  }
  return terminal.playlist
}
