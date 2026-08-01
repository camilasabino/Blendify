import type { RankedSeedUsage, UserUsageStats } from '@blendify/contracts';

export const USAGE_STATS_REPOSITORY = 'USAGE_STATS_REPOSITORY' as const;

type SeedUsageKind = 'artist' | 'genre';

export type SeedUsageInput = {
  kind: SeedUsageKind;
  seedKey: string;
  name: string;
  imageUrl?: string | null;
};

export type { RankedSeedUsage };
export type UserUsageStatsSnapshot = UserUsageStats;

export interface UsageStatsRepositoryPort {
  recordMix(input: {
    userId: string;
    kind: SeedUsageKind;
    seeds: SeedUsageInput[];
  }): Promise<void>;

  getStats(
    userId: string,
    options?: { topLimit?: number },
  ): Promise<UserUsageStatsSnapshot>;

  resetStats(userId: string): Promise<void>;
}
