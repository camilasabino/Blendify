/**
 * Spotify answered the first Web API call of a login with 403.
 *
 * Spotify documents that a user can complete the authorization screen and
 * still be unable to use the application under its current access
 * restrictions; in that case every request made with that user's access token
 * fails with 403. The login therefore cannot produce a usable session.
 */
export class SpotifyAccountRestrictedError extends Error {
  constructor() {
    super('Spotify account cannot use this application right now');
    this.name = 'SpotifyAccountRestrictedError';
  }
}
