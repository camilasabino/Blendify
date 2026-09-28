export type AiSessionErrorCode =
  | 'AI_SESSION_NOT_FOUND'
  | 'AI_CLARIFICATION_OPTION_UNAVAILABLE'
  | 'AI_SESSION_NOT_READY'
  | 'AI_GENERATION_IN_PROGRESS'
  | 'AI_GENERATION_SUPERSEDED'
  | 'AI_PLAYLIST_NOT_GENERATED'
  | 'AI_DESTINATION_IN_PROGRESS'
  | 'AI_DESTINATION_UNAVAILABLE'
  | 'AI_REFINEMENT_UNAVAILABLE'
  | 'AI_REFINEMENT_IN_PROGRESS'
  | 'AI_REFINEMENT_LIMIT_REACHED'
  | 'AI_REFINEMENT_SUPERSEDED'
  | 'AI_REFINEMENT_PENDING'
  | 'AI_REFINEMENT_STALE'
  | 'AI_REFINEMENT_NOT_APPLICABLE';

export class AiSessionError extends Error {
  private constructor(
    readonly code: AiSessionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AiSessionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static notFound(): AiSessionError {
    return new AiSessionError(
      'AI_SESSION_NOT_FOUND',
      'This Create with AI session has expired. Start again with a new request.',
    );
  }

  static optionUnavailable(): AiSessionError {
    return new AiSessionError(
      'AI_CLARIFICATION_OPTION_UNAVAILABLE',
      'This choice is no longer available for the current request.',
    );
  }

  static notReady(): AiSessionError {
    return new AiSessionError(
      'AI_SESSION_NOT_READY',
      'Finish reviewing this request before creating a playlist.',
    );
  }

  static generationInProgress(): AiSessionError {
    return new AiSessionError(
      'AI_GENERATION_IN_PROGRESS',
      'This playlist is already being created.',
    );
  }

  static playlistNotGenerated(): AiSessionError {
    return new AiSessionError(
      'AI_PLAYLIST_NOT_GENERATED',
      'Create the playlist preview before saving or transferring it.',
    );
  }

  static destinationInProgress(): AiSessionError {
    return new AiSessionError(
      'AI_DESTINATION_IN_PROGRESS',
      'This playlist is already being saved or transferred.',
    );
  }

  static destinationUnavailable(): AiSessionError {
    return new AiSessionError(
      'AI_DESTINATION_UNAVAILABLE',
      'This playlist was already sent to Spotify.',
    );
  }

  static destinationBlockedByRefinement(): AiSessionError {
    return new AiSessionError(
      'AI_REFINEMENT_PENDING',
      'Finish or dismiss the current refinement before saving or transferring this playlist.',
    );
  }

  static destinationSuperseded(): AiSessionError {
    return new AiSessionError(
      'AI_REFINEMENT_SUPERSEDED',
      'This playlist changed while it was being transferred. Review the latest version and try again.',
    );
  }

  static refinementPending(): AiSessionError {
    return new AiSessionError(
      'AI_REFINEMENT_PENDING',
      'Apply or dismiss the current refinement before requesting another one.',
    );
  }

  static refinementStale(): AiSessionError {
    return new AiSessionError(
      'AI_REFINEMENT_STALE',
      'This refinement is no longer the current one. Review the latest version of the playlist.',
    );
  }

  static refinementNotApplicable(): AiSessionError {
    return new AiSessionError(
      'AI_REFINEMENT_NOT_APPLICABLE',
      'Only a ready proposed playlist can be applied.',
    );
  }

  static refinementUnavailable(): AiSessionError {
    return new AiSessionError(
      'AI_REFINEMENT_UNAVAILABLE',
      'This playlist was already saved or transferred. Start over to create another version.',
    );
  }

  static refinementInProgress(): AiSessionError {
    return new AiSessionError(
      'AI_REFINEMENT_IN_PROGRESS',
      'A change to this playlist is already being interpreted.',
    );
  }

  static refinementLimitReached(): AiSessionError {
    return new AiSessionError(
      'AI_REFINEMENT_LIMIT_REACHED',
      'This playlist cannot be changed any further. Start over to create another version.',
    );
  }

  static refinementSuperseded(): AiSessionError {
    return new AiSessionError(
      'AI_REFINEMENT_SUPERSEDED',
      'This playlist changed while your request was being interpreted. Try again.',
    );
  }

  static generationSuperseded(): AiSessionError {
    return new AiSessionError(
      'AI_GENERATION_SUPERSEDED',
      'This playlist request was interrupted. Try creating it again.',
    );
  }
}
