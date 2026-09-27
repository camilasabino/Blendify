export type AiSessionErrorCode =
  'AI_SESSION_NOT_FOUND' | 'AI_CLARIFICATION_OPTION_UNAVAILABLE';

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
}
