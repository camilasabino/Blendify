const MARKET_PATTERN = /^[A-Z]{2}$/;

export function normalizeMarket(value?: string | null): string | undefined {
  const market = value?.trim().toUpperCase();
  return market && MARKET_PATTERN.test(market) ? market : undefined;
}

export function parseConfiguredMarket(value?: string | null): string {
  const market = normalizeMarket(value);
  if (!market) {
    throw new Error(
      `SPOTIFY_CATALOG_MARKET is required and must be an ISO 3166-1 alpha-2 country code (got "${value ?? ''}")`,
    );
  }
  return market;
}

export function resolveCatalogMarket(
  requested: string | null | undefined,
  configured: string,
): string {
  return normalizeMarket(requested) ?? configured;
}
