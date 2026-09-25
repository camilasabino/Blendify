export type TransferErrorCode =
  | 'TRANSFER_TOKEN_INVALID'
  | 'TRANSFER_TOKEN_EXPIRED'
  | 'TRANSFER_PLAYLIST_REJECTED'
  | 'TRANSFER_PROVIDER_UNAVAILABLE';

export const TRANSFER_PROVIDER_RETRY_AFTER_SECONDS = 10;

export class TransferError extends Error {
  private constructor(
    readonly code: TransferErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'TransferError';
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static tokenInvalid(): TransferError {
    return new TransferError(
      'TRANSFER_TOKEN_INVALID',
      'This playlist cannot be transferred. Generate it again.',
    );
  }

  static tokenExpired(): TransferError {
    return new TransferError(
      'TRANSFER_TOKEN_EXPIRED',
      'This playlist can no longer be transferred. Generate it again.',
    );
  }

  static playlistRejected(): TransferError {
    return new TransferError(
      'TRANSFER_PLAYLIST_REJECTED',
      'The transfer service could not accept this playlist.',
    );
  }

  static providerUnavailable(
    retryAfterSeconds = TRANSFER_PROVIDER_RETRY_AFTER_SECONDS,
  ): TransferError {
    return new TransferError(
      'TRANSFER_PROVIDER_UNAVAILABLE',
      'The transfer service is temporarily unavailable. Try again shortly.',
      retryAfterSeconds,
    );
  }
}
