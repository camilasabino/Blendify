import { useCallback, useEffect, useRef } from 'react'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

type SessionProbe = 'authenticated' | 'anonymous' | 'unreachable'

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

export function useAuth() {
  const user = useAuthStore((s) => s.user)
  const isLoading = useAuthStore((s) => s.isLoading)
  const isInitialized = useAuthStore((s) => s.isInitialized)
  const setUser = useAuthStore((s) => s.setUser)
  const setLoading = useAuthStore((s) => s.setLoading)
  const setInitialized = useAuthStore((s) => s.setInitialized)
  const clear = useAuthStore((s) => s.clear)
  const needsRetryRef = useRef(false)

  const refresh = useCallback(
    async (options: { retries?: boolean } = {}) => {
      setLoading(true)
      const delays = options.retries === false ? [0] : [0, 500, 1200, 2500, 4000]

      let last: SessionProbe = 'unreachable'
      for (const delay of delays) {
        if (delay > 0) await sleep(delay)
        const result = await probeSession()
        last = result.status
        if (result.status === 'authenticated') {
          setUser(result.user)
          needsRetryRef.current = false
          break
        }
        if (result.status === 'anonymous') {
          setUser(null)
          needsRetryRef.current = false
          break
        }
        // unreachable → keep trying
      }

      if (last === 'unreachable') {
        // Don't invent a logout: leave user as-is and retry when the tab
        // becomes visible again (typical after `npm run restart`).
        needsRetryRef.current = true
      }

      setLoading(false)
      setInitialized(true)
    },
    [setInitialized, setLoading, setUser],
  )

  useEffect(() => {
    if (!isInitialized) {
      void refresh({ retries: true })
    }
  }, [isInitialized, refresh])

  useEffect(() => {
    const retryIfNeeded = () => {
      if (
        document.visibilityState === 'visible' &&
        needsRetryRef.current &&
        !useAuthStore.getState().isLoading
      ) {
        void refresh({ retries: true })
      }
    }
    document.addEventListener('visibilitychange', retryIfNeeded)
    window.addEventListener('focus', retryIfNeeded)
    return () => {
      document.removeEventListener('visibilitychange', retryIfNeeded)
      window.removeEventListener('focus', retryIfNeeded)
    }
  }, [refresh])

  const login = useCallback(() => {
    window.location.href = api.loginUrl()
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      needsRetryRef.current = false
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
    refresh,
  }
}
