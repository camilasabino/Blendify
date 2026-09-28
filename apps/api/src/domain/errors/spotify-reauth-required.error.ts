export class SpotifyReauthRequiredError extends Error {
  readonly code = 'SPOTIFY_REAUTH_REQUIRED';

  constructor(options?: { cause?: unknown }) {
    super(
      'Spotify authorization is no longer valid. Reconnect Spotify.',
      options,
    );
    this.name = 'SpotifyReauthRequiredError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
