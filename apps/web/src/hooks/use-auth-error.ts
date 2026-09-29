import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  AUTH_ERROR_PARAM,
  parseAuthError,
  type AuthError,
} from '@/lib/auth-error'

export type AuthErrorReport = {
  error: AuthError | null
  hasReport: boolean
  dismiss: () => void
}

/**
 * Reads the outcome of a failed Spotify login once and drops it from the URL,
 * so reloading the page does not bring a stale notice back. The outcome is read
 * on the first render, before any auth-driven redirect can run, and `hasReport`
 * stays true after a dismissal so the redirect cannot swallow the feedback.
 */
export function useAuthError(): AuthErrorReport {
  const location = useLocation()
  const navigate = useNavigate()
  const [error, setError] = useState<AuthError | null>(() =>
    parseAuthError(new URLSearchParams(location.search).get(AUTH_ERROR_PARAM)),
  )
  const reported = useRef(error !== null)

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (!params.has(AUTH_ERROR_PARAM)) {
      return
    }

    reported.current = true
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

  return { error, hasReport: reported.current, dismiss }
}
