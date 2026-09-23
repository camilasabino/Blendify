import {
  sliceCatalogWindow,
  catalogPoolBounds,
  catalogCandidateBudget,
  expandCatalogPoolBounds,
  nextCatalogBatch,
  catalogEntryKey,
  POPULAR_POOL_SHARE,
  RARITIES_POOL_START,
} from './catalog-window';
import { PopularityMode } from '@blendify/contracts';

/** Deterministic RNG: always pick the last remaining Fisher–Yates index. */
const pickLast = () => 0.999999;

describe('catalogPoolBounds', () => {
  it('uses the first 40% for popular', () => {
    expect(catalogPoolBounds(50, PopularityMode.POPULAR)).toEqual({
      start: 0,
      end: 20,
    });
    expect(catalogPoolBounds(100, PopularityMode.POPULAR)).toEqual({
      start: 0,
      end: 40,
    });
    expect(POPULAR_POOL_SHARE).toBe(0.4);
  });

  it('uses the full chart for balanced', () => {
    expect(catalogPoolBounds(50, PopularityMode.BALANCED)).toEqual({
      start: 0,
      end: 50,
    });
  });

  it('uses the last 40% (60–100%) for rarities', () => {
    expect(catalogPoolBounds(50, PopularityMode.RARITIES)).toEqual({
      start: 30,
      end: 50,
    });
    expect(catalogPoolBounds(100, PopularityMode.RARITIES)).toEqual({
      start: 60,
      end: 100,
    });
    expect(RARITIES_POOL_START).toBe(0.6);
  });

  it('returns an empty window for an empty or negative-length chart', () => {
    expect(catalogPoolBounds(0, PopularityMode.POPULAR)).toEqual({
      start: 0,
      end: 0,
    });
    expect(catalogPoolBounds(-1, PopularityMode.BALANCED)).toEqual({
      start: 0,
      end: 0,
    });
  });
});

describe('catalogCandidateBudget', () => {
  it('returns zero for a non-positive need', () => {
    expect(catalogCandidateBudget(0)).toBe(0);
    expect(catalogCandidateBudget(-5)).toBe(0);
  });
});

describe('catalogEntryKey', () => {
  it('treats a missing artist name as empty rather than "undefined"', () => {
    expect(catalogEntryKey({ trackName: 'Song' })).toBe(
      catalogEntryKey({ artistName: '', trackName: 'Song' }),
    );
  });
});

describe('expandCatalogPoolBounds', () => {
  it('grows popular downward toward the chart tail', () => {
    expect(
      expandCatalogPoolBounds(50, PopularityMode.POPULAR, {
        start: 0,
        end: 20,
      }),
    ).toEqual({ start: 0, end: 25 });
  });

  it('grows rarities upward toward the chart head', () => {
    expect(
      expandCatalogPoolBounds(50, PopularityMode.RARITIES, {
        start: 30,
        end: 50,
      }),
    ).toEqual({ start: 25, end: 50 });
  });

  it('returns null when there is nowhere left to expand', () => {
    expect(
      expandCatalogPoolBounds(50, PopularityMode.POPULAR, {
        start: 0,
        end: 50,
      }),
    ).toBeNull();
    expect(
      expandCatalogPoolBounds(50, PopularityMode.RARITIES, {
        start: 0,
        end: 50,
      }),
    ).toBeNull();
    expect(
      expandCatalogPoolBounds(50, PopularityMode.BALANCED, {
        start: 0,
        end: 50,
      }),
    ).toBeNull();
  });

  it('returns null for an empty or negative-length chart', () => {
    expect(
      expandCatalogPoolBounds(0, PopularityMode.POPULAR, { start: 0, end: 0 }),
    ).toBeNull();
  });
});

describe('nextCatalogBatch', () => {
  const entries = Array.from({ length: 50 }, (_, i) => ({
    trackName: `t${i}`,
    artistName: 'A',
  }));

  it('expands popular when the preferred pool is exhausted', () => {
    const attempted = new Set(
      entries.slice(0, 20).map((entry) => catalogEntryKey(entry)),
    );
    const { batch, bounds, exhausted } = nextCatalogBatch(
      entries,
      PopularityMode.POPULAR,
      10,
      attempted,
      { start: 0, end: 20 },
      pickLast,
    );
    expect(exhausted).toBe(false);
    expect(bounds.end).toBeGreaterThan(20);
    expect(batch.length).toBeGreaterThan(0);
    for (const item of batch) {
      expect(attempted.has(catalogEntryKey(item))).toBe(false);
      expect(entries.indexOf(item)).toBeGreaterThanOrEqual(20);
    }
  });

  it('expands rarities toward the head when the tail is exhausted', () => {
    const attempted = new Set(
      entries.slice(30).map((entry) => catalogEntryKey(entry)),
    );
    const { batch, bounds, exhausted } = nextCatalogBatch(
      entries,
      PopularityMode.RARITIES,
      10,
      attempted,
      { start: 30, end: 50 },
      pickLast,
    );
    expect(exhausted).toBe(false);
    expect(bounds.start).toBeLessThan(30);
    expect(batch.length).toBeGreaterThan(0);
    for (const item of batch) {
      expect(entries.indexOf(item)).toBeLessThan(30);
    }
  });

  it('reports exhausted with an empty batch for empty entries or a non-positive need', () => {
    expect(
      nextCatalogBatch(
        [],
        PopularityMode.POPULAR,
        10,
        new Set(),
        { start: 0, end: 0 },
        pickLast,
      ),
    ).toEqual({ batch: [], bounds: { start: 0, end: 0 }, exhausted: true });

    expect(
      nextCatalogBatch(
        entries,
        PopularityMode.POPULAR,
        0,
        new Set(),
        { start: 0, end: 20 },
        pickLast,
      ),
    ).toEqual({
      batch: [],
      bounds: { start: 0, end: 20 },
      exhausted: true,
    });
  });

  it('reports exhausted once the pool cannot expand further (balanced mode)', () => {
    const attempted = new Set(entries.map((entry) => catalogEntryKey(entry)));
    const { batch, exhausted } = nextCatalogBatch(
      entries,
      PopularityMode.BALANCED,
      10,
      attempted,
      { start: 0, end: 50 },
      pickLast,
    );
    expect(exhausted).toBe(true);
    expect(batch).toEqual([]);
  });
});

describe('sliceCatalogWindow', () => {
  const entries = Array.from({ length: 50 }, (_, i) => `t${i}`);

  it('samples from the popular pool with a resolve buffer', () => {
    const picked = sliceCatalogWindow(
      entries,
      PopularityMode.POPULAR,
      10,
      pickLast,
    );
    expect(picked).toHaveLength(catalogCandidateBudget(10));
    for (const item of picked) {
      expect(entries.indexOf(item)).toBeLessThan(20);
    }
  });

  it('samples from the rarities tail pool', () => {
    const picked = sliceCatalogWindow(
      entries,
      PopularityMode.RARITIES,
      10,
      pickLast,
    );
    expect(picked).toHaveLength(catalogCandidateBudget(10));
    for (const item of picked) {
      expect(entries.indexOf(item)).toBeGreaterThanOrEqual(30);
    }
  });

  it('samples from the full chart for balanced', () => {
    const picked = sliceCatalogWindow(
      entries,
      PopularityMode.BALANCED,
      10,
      pickLast,
    );
    expect(picked).toHaveLength(catalogCandidateBudget(10));
    expect(new Set(picked).size).toBe(picked.length);
  });

  it('expands popular when needed exceeds the initial 40% pool', () => {
    const picked = sliceCatalogWindow(
      entries,
      PopularityMode.POPULAR,
      25,
      pickLast,
    );
    // needed 25 → budget 33, initial pool 20 → must expand past 40%
    expect(picked).toHaveLength(catalogCandidateBudget(25));
    expect(picked.some((item) => entries.indexOf(item) >= 20)).toBe(true);
  });

  it('does not exceed the pool size', () => {
    const small = ['a', 'b', 'c'];
    const picked = sliceCatalogWindow(small, PopularityMode.POPULAR, 10);
    expect(picked.length).toBeLessThanOrEqual(small.length);
  });

  it('returns empty for empty input', () => {
    expect(sliceCatalogWindow([], PopularityMode.RARITIES, 10)).toEqual([]);
  });
});
