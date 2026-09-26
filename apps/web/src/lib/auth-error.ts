/**
 * Product-level outcomes the API sends back after an unsuccessful Spotify
 * login. They mirror `AUTH_CALLBACK_ERRORS` on the API side.
 */
export const AUTH_ERRORS = [
  'access_denied',
  'access_restricted',
  'connection_failed',
  'invalid_state',
] as const

export type AuthError = (typeof AUTH_ERRORS)[number]

export const AUTH_ERROR_PARAM = 'auth_error'

/** Anything we do not recognise is reported as a generic provider failure. */
export function parseAuthError(value: string | null): AuthError | null {
  if (!value) return null
  return (AUTH_ERRORS as readonly string[]).includes(value)
    ? (value as AuthError)
    : 'connection_failed'
}
