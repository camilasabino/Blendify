import { useCallback, useEffect } from 'react'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

type SessionProbe = 'authenticated' | 'anonymous' | 'unreachable'

const RETRY_DELAYS_MS = [0, 500, 1200, 2500, 4000]

let inFlightRefresh: Promise<void> | null = null
let needsRetry = false

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function probeSession(): Promise<{
  status: SessionProbe
  user: Awaited<ReturnType<typeof api.getMe>>['user']
}> {
  try {
    const { user } = await api.getMe()
    return {
      status: user ? 'authenticated' : 'anonymous',
      user,
    }
  } catch (error) {
    // Definitive client errors → treat as logged out.
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
      return { status: 'anonymous', user: null }
    }
    // Network / 5xx while API is restarting — cookie may still be valid.
    return { status: 'unreachable', user: null }
  }
}

async function runSessionRefresh(retries: boolean): Promise<void> {
  const { setUser, setLoading, setInitialized } = useAuthStore.getState()
  setLoading(true)
  const delays = retries ? RETRY_DELAYS_MS : [0]

  let last: SessionProbe = 'unreachable'
  for (const delay of delays) {
    if (delay > 0) await sleep(delay)
    const result = await probeSession()
    last = result.status
    if (result.status === 'authenticated') {
      setUser(result.user)
      needsRetry = false
      break
    }
    if (result.status === 'anonymous') {
      setUser(null)
      needsRetry = false
      break
    }
    // unreachable → keep trying
  }

  if (last === 'unreachable') {
    // Don't invent a logout: leave user as-is and retry when the tab
    // becomes visible again (typical after `npm run restart`).
    needsRetry = true
  }

  setLoading(false)
  setInitialized(true)
}

export function refreshSession(
  options: { retries?: boolean } = {},
): Promise<void> {
  inFlightRefresh ??= runSessionRefresh(options.retries !== false).finally(
    () => {
      inFlightRefresh = null
    },
  )
  return inFlightRefresh
}

export function useAuthBootstrap(): void {
  useEffect(() => {
    if (!useAuthStore.getState().isInitialized) {
      void refreshSession({ retries: true })
    }
  }, [])

  useEffect(() => {
    const retryIfNeeded = () => {
      if (
        document.visibilityState === 'visible' &&
        needsRetry &&
        !useAuthStore.getState().isLoading
      ) {
        void refreshSession({ retries: true })
      }
    }
    document.addEventListener('visibilitychange', retryIfNeeded)
    window.addEventListener('focus', retryIfNeeded)
    return () => {
      document.removeEventListener('visibilitychange', retryIfNeeded)
      window.removeEventListener('focus', retryIfNeeded)
    }
  }, [])
}

export function useAuth() {
  const user = useAuthStore((s) => s.user)
  const isLoading = useAuthStore((s) => s.isLoading)
  const isInitialized = useAuthStore((s) => s.isInitialized)
  const clear = useAuthStore((s) => s.clear)

  const login = useCallback(() => {
    window.location.href = api.loginUrl()
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      needsRetry = false
      clear()
    }
  }, [clear])

  return {
    user,
    isLoading,
    isInitialized,
    isAuthenticated: Boolean(user),
    login,
    logout,
    refresh: refreshSession,
  }
}
