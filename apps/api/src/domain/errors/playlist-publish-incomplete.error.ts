import type { PlaylistPublishIncompleteDetails } from '@blendify/contracts';

export class PlaylistPublishIncompleteError extends Error {
  readonly code = 'SPOTIFY_PLAYLIST_INCOMPLETE';

  constructor(
    readonly details: PlaylistPublishIncompleteDetails,
    options?: { cause?: unknown },
  ) {
    super(
      details.failedStep === 'save_to_library'
        ? 'The playlist was created on Spotify, but Blendify could not save it to the Library.'
        : 'The playlist was created on Spotify, but Blendify could not finish adding its songs.',
      options,
    );
    this.name = 'PlaylistPublishIncompleteError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
