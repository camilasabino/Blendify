import { SpotifyAccountRestrictedError } from '@/infrastructure/spotify/spotify-auth.errors';
import { stripTrailingSlashes } from './strip-trailing-slashes';

/**
 * Product-level outcomes of a failed Spotify login. They are the only auth
 * failure vocabulary the frontend sees: provider messages, statuses and
 * identifiers never leave the API.
 */
export const AUTH_CALLBACK_ERRORS = [
  'access_denied',
  'access_restricted',
  'connection_failed',
  'invalid_state',
] as const;

export type AuthCallbackError = (typeof AUTH_CALLBACK_ERRORS)[number];

export const AUTH_ERROR_QUERY_PARAM = 'auth_error';

export const POST_LOGIN_PATH = '/app';

/** Maps the `error` Spotify sends back on the authorization screen. */
export function classifyAuthorizeError(
  providerError: string | undefined,
): AuthCallbackError {
  return providerError === 'access_denied'
    ? 'access_denied'
    : 'connection_failed';
}

/**
 * Maps a failure raised while exchanging the code or reading the profile.
 * Only the explicit restricted-account signal becomes `access_restricted`;
 * everything else stays generic.
 */
export function classifyCallbackFailure(error: unknown): AuthCallbackError {
  return error instanceof SpotifyAccountRestrictedError
    ? 'access_restricted'
    : 'connection_failed';
}

function frontendOrigin(frontendUrl: string): string {
  return stripTrailingSlashes(frontendUrl);
}

export function postLoginRedirectUrl(frontendUrl: string): string {
  return `${frontendOrigin(frontendUrl)}${POST_LOGIN_PATH}`;
}

export function authErrorRedirectUrl(
  frontendUrl: string,
  error: AuthCallbackError,
): string {
  return `${frontendOrigin(frontendUrl)}/?${AUTH_ERROR_QUERY_PARAM}=${error}`;
}
