import { useMemo } from 'react'
import { deriveCapabilities, type AppCapabilities } from '@/lib/capabilities'
import { useAuthStore } from '@/stores/auth-store'

export function useCapabilities(): AppCapabilities {
  const user = useAuthStore((s) => s.user)
  const isInitialized = useAuthStore((s) => s.isInitialized)
  return useMemo(
    () => deriveCapabilities({ user, isInitialized }),
    [user, isInitialized],
  )
}
