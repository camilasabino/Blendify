import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  AUTH_ERROR_PARAM,
  parseAuthError,
  type AuthError,
} from '@/lib/auth-error'

/**
 * Reads the outcome of a failed Spotify login once and drops it from the URL,
 * so reloading the page does not bring a stale notice back.
 */
export function useAuthError(): {
  error: AuthError | null
  dismiss: () => void
} {
  const location = useLocation()
  const navigate = useNavigate()
  const [error, setError] = useState<AuthError | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (!params.has(AUTH_ERROR_PARAM)) return

    setError(parseAuthError(params.get(AUTH_ERROR_PARAM)))
    params.delete(AUTH_ERROR_PARAM)
    const search = params.toString()
    navigate(
      { pathname: location.pathname, search: search ? `?${search}` : '' },
      { replace: true },
    )
  }, [location.pathname, location.search, navigate])

  const dismiss = useCallback(() => {
    setError(null)
  }, [])

  return { error, dismiss }
}
