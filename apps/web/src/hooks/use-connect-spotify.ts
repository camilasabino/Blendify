import { useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { markAppReturnTarget } from '@/lib/app-return-target'

export function useConnectSpotify(): () => void {
  const { login } = useAuth()
  const { pathname } = useLocation()

  return useCallback(() => {
    markAppReturnTarget(pathname)
    login()
  }, [login, pathname])
}
