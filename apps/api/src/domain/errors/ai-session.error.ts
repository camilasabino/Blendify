export type AiSessionErrorCode =
  | 'AI_SESSION_NOT_FOUND'
  | 'AI_CLARIFICATION_OPTION_UNAVAILABLE'
  | 'AI_SESSION_NOT_READY'
  | 'AI_GENERATION_IN_PROGRESS'
  | 'AI_GENERATION_SUPERSEDED';

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

  static generationSuperseded(): AiSessionError {
    return new AiSessionError(
      'AI_GENERATION_SUPERSEDED',
      'This playlist request was interrupted. Try creating it again.',
    );
  }
}
