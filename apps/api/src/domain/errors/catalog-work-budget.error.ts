export class CatalogWorkBudgetExhaustedError extends Error {
  constructor() {
    super('Catalog work budget exhausted');
    this.name = 'CatalogWorkBudgetExhaustedError';
  }
}
