import { useCallback, useEffect } from 'react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

export function useAuth() {
  const user = useAuthStore((s) => s.user)
  const isLoading = useAuthStore((s) => s.isLoading)
  const isInitialized = useAuthStore((s) => s.isInitialized)
  const setUser = useAuthStore((s) => s.setUser)
  const setLoading = useAuthStore((s) => s.setLoading)
  const setInitialized = useAuthStore((s) => s.setInitialized)
  const clear = useAuthStore((s) => s.clear)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const { user: next } = await api.getMe()
      setUser(next)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
      setInitialized(true)
    }
  }, [setInitialized, setLoading, setUser])

  useEffect(() => {
    if (!isInitialized) {
      void refresh()
    }
  }, [isInitialized, refresh])

  const login = useCallback(() => {
    window.location.href = api.loginUrl()
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
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
