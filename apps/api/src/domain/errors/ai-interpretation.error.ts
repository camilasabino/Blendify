export type AiInterpretationErrorCode =
  | 'AI_REQUEST_REJECTED'
  | 'AI_UNAVAILABLE'
  | 'AI_RATE_LIMITED'
  | 'AI_TIMEOUT'
  | 'AI_INVALID_OUTPUT';

export class AiInterpretationError extends Error {
  private constructor(
    readonly code: AiInterpretationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AiInterpretationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static requestRejected(): AiInterpretationError {
    return new AiInterpretationError(
      'AI_REQUEST_REJECTED',
      'This request cannot be sent for AI interpretation.',
    );
  }

  static unavailable(): AiInterpretationError {
    return new AiInterpretationError(
      'AI_UNAVAILABLE',
      'Create with AI is temporarily unavailable. Try again shortly.',
    );
  }

  static rateLimited(): AiInterpretationError {
    return new AiInterpretationError(
      'AI_RATE_LIMITED',
      'Create with AI is receiving too many requests. Try again shortly.',
    );
  }

  static timedOut(): AiInterpretationError {
    return new AiInterpretationError(
      'AI_TIMEOUT',
      'Create with AI took too long to respond. Try again.',
    );
  }

  static invalidOutput(): AiInterpretationError {
    return new AiInterpretationError(
      'AI_INVALID_OUTPUT',
      'Create with AI could not understand this request. Try rephrasing it.',
    );
  }
}
