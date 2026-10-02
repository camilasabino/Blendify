import { CatalogWorkBudgetExhaustedError } from '@/domain/errors/catalog-work-budget.error';
import {
  CATALOG_MATCH_SEARCH_LIMIT,
  type CatalogProviderPort,
} from '@/domain/repositories/catalog-provider.port';

export const ARTIST_MIX_WORK_POLICY = {
  LEGACY: 'legacy',
  COVERAGE_FIRST_BOUNDED: 'coverage-first-bounded',
} as const;

export type ArtistMixWorkPolicy =
  (typeof ARTIST_MIX_WORK_POLICY)[keyof typeof ARTIST_MIX_WORK_POLICY];

export type CoverageFirstResolveTranche = 'coverage' | 'redistribution';

export type CoverageFirstWorkPlan = {
  coverageResolveBudget: number;
  redistributionResolveBudget: number;
  maxTrackResolutions: number;
  maxFallbackSearches: number;
  maxTrackCatalogOperations: number;
  maxInspectedCandidates: number;
};

const COVERAGE_FIRST_CHART_RESOLVE_CAP = 50;
const COVERAGE_FIRST_ATTEMPT_MULTIPLIER = 3;
const COVERAGE_FIRST_ATTEMPT_MIN_OVER_FETCH = 12;

export function initialCoverageQuotas(
  sourceCount: number,
  totalNeeded: number,
): number[] {
  if (sourceCount <= 0 || totalNeeded <= 0) {
    return Array.from({ length: Math.max(0, sourceCount) }, () => 0);
  }

  const base = Math.floor(totalNeeded / sourceCount);
  let remainder = totalNeeded % sourceCount;
  const quotas: number[] = [];

  for (let index = 0; index < sourceCount; index += 1) {
    const share = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) {
      remainder -= 1;
    }
    quotas.push(share);
  }

  return quotas;
}

export function planCoverageFirstBoundedWork(input: {
  totalNeeded: number;
  sourceCount: number;
}): CoverageFirstWorkPlan {
  const coverageResolveBudget = coverageFirstResolveTranche(input.totalNeeded);
  const redistributionResolveBudget = coverageResolveBudget;
  const maxTrackResolutions =
    coverageResolveBudget + redistributionResolveBudget;
  const maxFallbackSearches = Math.min(
    Math.max(0, input.sourceCount),
    Math.max(0, input.totalNeeded),
  );

  return {
    coverageResolveBudget,
    redistributionResolveBudget,
    maxTrackResolutions,
    maxFallbackSearches,
    maxTrackCatalogOperations: maxTrackResolutions + maxFallbackSearches,
    maxInspectedCandidates:
      maxTrackResolutions + CATALOG_MATCH_SEARCH_LIMIT * maxFallbackSearches,
  };
}

export function createCoverageFirstWorkBudget(plan: CoverageFirstWorkPlan) {
  let coverageResolvesRemaining = plan.coverageResolveBudget;
  let redistributionResolvesRemaining = plan.redistributionResolveBudget;
  let searchesRemaining = plan.maxFallbackSearches;
  let resolvesConsumed = 0;
  let searchesConsumed = 0;

  return {
    get coverageResolvesRemaining() {
      return coverageResolvesRemaining;
    },
    get redistributionResolvesRemaining() {
      return redistributionResolvesRemaining;
    },
    get searchesRemaining() {
      return searchesRemaining;
    },
    get resolvesConsumed() {
      return resolvesConsumed;
    },
    get searchesConsumed() {
      return searchesConsumed;
    },
    consumeResolve(tranche: CoverageFirstResolveTranche): boolean {
      if (tranche === 'coverage') {
        if (coverageResolvesRemaining <= 0) {
          return false;
        }
        coverageResolvesRemaining -= 1;
        resolvesConsumed += 1;
        return true;
      }

      if (redistributionResolvesRemaining <= 0) {
        return false;
      }
      redistributionResolvesRemaining -= 1;
      resolvesConsumed += 1;
      return true;
    },
    consumeSearch(): boolean {
      if (searchesRemaining <= 0) {
        return false;
      }
      searchesRemaining -= 1;
      searchesConsumed += 1;
      return true;
    },
  };
}

function coverageFirstResolveTranche(totalNeeded: number): number {
  return Math.min(
    COVERAGE_FIRST_CHART_RESOLVE_CAP,
    coverageFirstAttemptLimit(totalNeeded),
  );
}

export function bindCatalogWorkBudget(
  catalog: CatalogProviderPort,
  budget: ReturnType<typeof createCoverageFirstWorkBudget>,
  trancheOf: () => CoverageFirstResolveTranche,
): CatalogProviderPort {
  return {
    getArtistsByIds: (ids) => catalog.getArtistsByIds(ids),
    searchArtists: (query, limit) => catalog.searchArtists(query, limit),
    resolveTrack: async (artistName, trackName, options) => {
      if (!budget.consumeResolve(trancheOf())) {
        throw new CatalogWorkBudgetExhaustedError();
      }
      return catalog.resolveTrack(artistName, trackName, options);
    },
    searchTracks: async (query, options) => {
      if (!budget.consumeSearch()) {
        throw new CatalogWorkBudgetExhaustedError();
      }
      return catalog.searchTracks(query, options);
    },
  };
}

function coverageFirstAttemptLimit(totalNeeded: number): number {
  if (totalNeeded <= 0) {
    return 0;
  }
  return Math.max(
    totalNeeded * COVERAGE_FIRST_ATTEMPT_MULTIPLIER,
    totalNeeded + COVERAGE_FIRST_ATTEMPT_MIN_OVER_FETCH,
  );
}
