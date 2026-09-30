import type { SpotifyFailureDetails } from '@blendify/contracts';

export class ProviderOutcomeUnknownError extends Error {
  readonly code = 'SPOTIFY_OUTCOME_UNKNOWN';

  constructor(
    message: string,
    readonly failure?: SpotifyFailureDetails,
  ) {
    super(message);
    this.name = 'ProviderOutcomeUnknownError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
