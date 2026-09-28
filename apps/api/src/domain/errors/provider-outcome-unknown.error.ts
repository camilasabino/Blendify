export class ProviderOutcomeUnknownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderOutcomeUnknownError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
