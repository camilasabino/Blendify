export class CatalogUnavailableError extends Error {
  readonly code = 'CATALOG_UNAVAILABLE';

  constructor(options?: { cause?: unknown }) {
    super(
      'The music catalog is temporarily unavailable. Try again shortly.',
      options,
    );
    this.name = 'CatalogUnavailableError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
