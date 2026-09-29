const STORAGE_KEY = 'blendify.aiSession'
const RETURN_AFTER_LOGIN_KEY = 'blendify.aiReturnAfterLogin'
const RETURN_AFTER_LOGIN_TTL_MS = 15 * 60_000

export type StoredAiSession = Readonly<{
  sessionId: string
  accessKey: string
  prompt: string
  playlistTitle: string | null
}>

function isStoredAiSession(value: unknown): value is StoredAiSession {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sessionId' in value &&
    'accessKey' in value &&
    'prompt' in value &&
    'playlistTitle' in value &&
    typeof value.sessionId === 'string' &&
    value.sessionId.length > 0 &&
    typeof value.accessKey === 'string' &&
    value.accessKey.length > 0 &&
    typeof value.prompt === 'string' &&
    (value.playlistTitle === null || typeof value.playlistTitle === 'string')
  )
}

export function readStoredAiSession(): StoredAiSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }
    const parsed: unknown = JSON.parse(raw)
    return isStoredAiSession(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeStoredAiSession(session: StoredAiSession): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    return
  }
}

export function clearStoredAiSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    return
  }
}

export function markAiReturnAfterLogin(now: number = Date.now()): void {
  try {
    sessionStorage.setItem(RETURN_AFTER_LOGIN_KEY, String(now))
  } catch {
    return
  }
}

export function consumeAiReturnAfterLogin(now: number = Date.now()): boolean {
  try {
    const raw = sessionStorage.getItem(RETURN_AFTER_LOGIN_KEY)
    sessionStorage.removeItem(RETURN_AFTER_LOGIN_KEY)
    const markedAt = Number(raw)
    return (
      raw !== null &&
      Number.isFinite(markedAt) &&
      now >= markedAt &&
      now - markedAt <= RETURN_AFTER_LOGIN_TTL_MS
    )
  } catch {
    return false
  }
}
