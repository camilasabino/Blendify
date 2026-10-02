import { CatalogWorkBudgetExhaustedError } from '@/domain/errors/catalog-work-budget.error';
import type { CatalogProviderPort } from '@/domain/repositories/catalog-provider.port';
import {
  bindCatalogWorkBudget,
  createCoverageFirstWorkBudget,
  initialCoverageQuotas,
  planCoverageFirstBoundedWork,
} from './artist-mix-work-policy';

describe('coverage-first-bounded quotas', () => {
  it('gives one slot per artist when the target matches the source count', () => {
    expect(initialCoverageQuotas(10, 10)).toEqual([
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    ]);
  });

  it('prorates 23 tracks across 12 artists as eleven 2s and one 1', () => {
    expect(initialCoverageQuotas(12, 23)).toEqual([
      2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1,
    ]);
  });

  it('gives a single slot to the first source when the target is 1', () => {
    expect(initialCoverageQuotas(2, 1)).toEqual([1, 0]);
  });

  it('splits a small artist set evenly', () => {
    expect(initialCoverageQuotas(2, 10)).toEqual([5, 5]);
  });

  it('caps each coverage tranche at the chart length for a full 50-track mix', () => {
    const plan = planCoverageFirstBoundedWork({
      totalNeeded: 48,
      sourceCount: 12,
    });

    expect(initialCoverageQuotas(12, 48)).toEqual([
      4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
    ]);
    expect(plan.coverageResolveBudget).toBe(50);
    expect(plan.redistributionResolveBudget).toBe(50);
    expect(plan.maxTrackResolutions).toBe(100);
    expect(plan.maxFallbackSearches).toBe(12);
    expect(plan.maxTrackCatalogOperations).toBe(112);
  });
});

describe('coverage-first-bounded work plan', () => {
  it('exposes separate coverage and redistribution resolve tranches for the P0 10/10 case', () => {
    const plan = planCoverageFirstBoundedWork({
      totalNeeded: 10,
      sourceCount: 10,
    });

    expect(plan.coverageResolveBudget).toBe(30);
    expect(plan.redistributionResolveBudget).toBe(30);
    expect(plan.maxTrackResolutions).toBe(60);
    expect(plan.maxFallbackSearches).toBe(10);
    expect(plan.maxTrackCatalogOperations).toBe(70);
    expect(plan.maxInspectedCandidates).toBe(160);
  });

  it('caps the 23/12 tranches at the chart length instead of a per-seed limit', () => {
    const plan = planCoverageFirstBoundedWork({
      totalNeeded: 23,
      sourceCount: 12,
    });

    expect(plan.coverageResolveBudget).toBe(50);
    expect(plan.redistributionResolveBudget).toBe(50);
    expect(plan.maxTrackResolutions).toBe(100);
    expect(plan.maxFallbackSearches).toBe(12);
    expect(plan.maxTrackCatalogOperations).toBe(112);
  });

  it('keeps a generation-wide attempt floor when the target is 1', () => {
    const plan = planCoverageFirstBoundedWork({
      totalNeeded: 1,
      sourceCount: 2,
    });

    expect(plan.coverageResolveBudget).toBe(13);
    expect(plan.redistributionResolveBudget).toBe(13);
    expect(plan.maxTrackResolutions).toBe(26);
    expect(plan.maxFallbackSearches).toBe(1);
    expect(plan.maxTrackCatalogOperations).toBe(27);
  });
});

describe('coverage-first-bounded work budget', () => {
  it('debits coverage and redistribution resolves as separate tranches', () => {
    const budget = createCoverageFirstWorkBudget(
      planCoverageFirstBoundedWork({ totalNeeded: 10, sourceCount: 10 }),
    );

    expect(budget.consumeResolve('coverage')).toBe(true);
    expect(budget.coverageResolvesRemaining).toBe(29);
    expect(budget.redistributionResolvesRemaining).toBe(30);

    expect(budget.consumeResolve('redistribution')).toBe(true);
    expect(budget.coverageResolvesRemaining).toBe(29);
    expect(budget.redistributionResolvesRemaining).toBe(29);
    expect(budget.resolvesConsumed).toBe(2);
  });

  it('refuses a resolve after that tranche is spent and never counts the refused call', () => {
    const budget = createCoverageFirstWorkBudget({
      coverageResolveBudget: 1,
      redistributionResolveBudget: 0,
      maxTrackResolutions: 1,
      maxFallbackSearches: 0,
      maxTrackCatalogOperations: 1,
      maxInspectedCandidates: 1,
    });

    expect(budget.consumeResolve('coverage')).toBe(true);
    expect(budget.consumeResolve('coverage')).toBe(false);
    expect(budget.consumeResolve('redistribution')).toBe(false);
    expect(budget.resolvesConsumed).toBe(1);
  });

  it('counts a repeated resolveTrack call, including a cache-like hit, as a logical resolve', async () => {
    const budget = createCoverageFirstWorkBudget({
      coverageResolveBudget: 2,
      redistributionResolveBudget: 0,
      maxTrackResolutions: 2,
      maxFallbackSearches: 0,
      maxTrackCatalogOperations: 2,
      maxInspectedCandidates: 2,
    });
    const resolveTrack = jest.fn().mockResolvedValue(null);
    const catalog = bindCatalogWorkBudget(
      { resolveTrack } as unknown as CatalogProviderPort,
      budget,
      () => 'coverage',
    );

    await catalog.resolveTrack('Act 1', 'Song 1');
    await catalog.resolveTrack('Act 1', 'Song 1');

    expect(resolveTrack).toHaveBeenCalledTimes(2);
    expect(budget.resolvesConsumed).toBe(2);
    await expect(
      catalog.resolveTrack('Act 1', 'Song 1'),
    ).rejects.toBeInstanceOf(CatalogWorkBudgetExhaustedError);
    expect(resolveTrack).toHaveBeenCalledTimes(2);
  });

  it('refuses a search after the search budget is spent', () => {
    const budget = createCoverageFirstWorkBudget({
      coverageResolveBudget: 0,
      redistributionResolveBudget: 0,
      maxTrackResolutions: 0,
      maxFallbackSearches: 1,
      maxTrackCatalogOperations: 1,
      maxInspectedCandidates: 10,
    });

    expect(budget.consumeSearch()).toBe(true);
    expect(budget.consumeSearch()).toBe(false);
    expect(budget.searchesConsumed).toBe(1);
    expect(budget.searchesRemaining).toBe(0);
  });
});
