export const PROVIDER_QUOTA = 'PROVIDER_QUOTA' as const;

export interface ProviderQuotaPort {
  assertAvailable(): void;
}
