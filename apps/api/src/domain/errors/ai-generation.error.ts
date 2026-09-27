import type { AiSeedType } from '@blendify/contracts';

export type AiGenerationErrorCode = 'AI_SEED_NOT_FOUND';

export class AiGenerationError extends Error {
  private constructor(
    readonly code: AiGenerationErrorCode,
    message: string,
    readonly details: { seedType: AiSeedType; names: string[] },
  ) {
    super(message);
    this.name = 'AiGenerationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static seedNotFound(
    seedType: AiSeedType,
    names: string[],
  ): AiGenerationError {
    return new AiGenerationError(
      'AI_SEED_NOT_FOUND',
      'Some requested artists or tracks could not be found. Edit the request and try again.',
      { seedType, names },
    );
  }
}
