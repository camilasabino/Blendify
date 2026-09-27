const STORAGE_KEY = 'blendify.aiSession'

export type StoredAiSession = Readonly<{
  sessionId: string
  prompt: string
  playlistTitle: string | null
}>

function isStoredAiSession(value: unknown): value is StoredAiSession {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sessionId' in value &&
    'prompt' in value &&
    'playlistTitle' in value &&
    typeof value.sessionId === 'string' &&
    value.sessionId.length > 0 &&
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
