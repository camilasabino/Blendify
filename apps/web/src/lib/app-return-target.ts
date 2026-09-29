import { isAiCreationEnabled } from '@/lib/ai-creation'

const STORAGE_KEY = 'blendify.appReturnTo'
const RETURN_TARGET_TTL_MS = 15 * 60_000

const AI_RETURN_TARGET = '/app/ai'

const RETURN_TARGETS = ['/app/mix', '/app/discover', AI_RETURN_TARGET] as const

export type AppReturnTarget = (typeof RETURN_TARGETS)[number]

function isAllowedTarget(value: unknown): value is AppReturnTarget {
  if (
    typeof value !== 'string' ||
    !(RETURN_TARGETS as readonly string[]).includes(value)
  ) {
    return false
  }
  return value !== AI_RETURN_TARGET || isAiCreationEnabled()
}

export function markAppReturnTarget(
  path: string,
  now: number = Date.now(),
): void {
  try {
    if (!isAllowedTarget(path)) {
      sessionStorage.removeItem(STORAGE_KEY)
      return
    }
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ target: path, markedAt: now }),
    )
  } catch {
    return
  }
}

export function clearAppReturnTarget(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    return
  }
}

export function consumeAppReturnTarget(
  now: number = Date.now(),
): AppReturnTarget | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    sessionStorage.removeItem(STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return null
    }
    if (!('target' in parsed) || !('markedAt' in parsed)) {
      return null
    }

    const { target, markedAt } = parsed
    if (!isAllowedTarget(target) || typeof markedAt !== 'number') {
      return null
    }

    const age = now - markedAt
    return age >= 0 && age <= RETURN_TARGET_TTL_MS ? target : null
  } catch {
    return null
  }
}
