import type { SpotifyFailureDetails } from '@blendify/contracts';

export type SpotifyProviderErrorCode =
  | 'SPOTIFY_UNAVAILABLE'
  | 'SPOTIFY_PERMISSION_DENIED'
  | 'SPOTIFY_REQUEST_REJECTED';

const MESSAGES: Record<SpotifyProviderErrorCode, string> = {
  SPOTIFY_UNAVAILABLE:
    'Blendify could not communicate properly with Spotify. Try again.',
  SPOTIFY_PERMISSION_DENIED: 'Spotify did not allow this action.',
  SPOTIFY_REQUEST_REJECTED: 'Spotify could not process this request.',
};

export class SpotifyProviderError extends Error {
  constructor(
    readonly code: SpotifyProviderErrorCode,
    readonly failure: SpotifyFailureDetails,
    options?: { cause?: unknown },
  ) {
    super(MESSAGES[code], options);
    this.name = 'SpotifyProviderError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
