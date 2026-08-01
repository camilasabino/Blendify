import {
  PopularityMode,
  type PopularityMode as PopularityModeValue,
} from '@blendify/contracts';

export type CatalogTrackRef = {
  artistName: string;
  trackName: string;
  /** Last.fm playcount when known — higher = more played. */
  playcount?: number;
  /** 1-based chart rank when known. */
  rank?: number;
};

/** Head of the chart used for popular / top mixes. */
export const POPULAR_POOL_SHARE = 0.4;
/** Tail of the chart used for rarities (from this fraction to the end). */
export const RARITIES_POOL_START = 0.6;
/** How much of the chart to grow the pool by on each expand step. */
const POOL_EXPAND_STEP_SHARE = 0.1;

/**
 * Candidate over-fetch so Spotify resolve misses don't underfill the mix.
 * Kept tight — each candidate may cost a search.
 */
export function catalogCandidateBudget(needed: number): number {
  if (needed <= 0) return 0;
  return needed + 8;
}

export function catalogPoolBounds(
  length: number,
  mode: PopularityModeValue,
): { start: number; end: number } {
  if (length <= 0) return { start: 0, end: 0 };

  switch (mode) {
    case PopularityMode.POPULAR: {
      const end = Math.max(1, Math.ceil(length * POPULAR_POOL_SHARE));
      return { start: 0, end: Math.min(length, end) };
    }
    case PopularityMode.BALANCED:
      return { start: 0, end: length };
    case PopularityMode.RARITIES: {
      const start = Math.min(
        Math.floor(length * RARITIES_POOL_START),
        Math.max(0, length - 1),
      );
      return { start, end: length };
    }
  }
}

/**
 * Widen the pool toward the rest of the chart when the preferred band
 * underfills: popular grows downward, rarities grows upward.
 */
export function expandCatalogPoolBounds(
  length: number,
  mode: PopularityModeValue,
  current: { start: number; end: number },
): { start: number; end: number } | null {
  if (length <= 0) return null;
  if (mode === PopularityMode.BALANCED) return null;

  const step = Math.max(1, Math.ceil(length * POOL_EXPAND_STEP_SHARE));

  if (mode === PopularityMode.POPULAR) {
    if (current.end >= length) return null;
    return { start: 0, end: Math.min(length, current.end + step) };
  }

  // rarities: expand toward the chart head
  if (current.start <= 0) return null;
  return { start: Math.max(0, current.start - step), end: length };
}

function shuffleCopy<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}

export function catalogEntryKey(entry: {
  artistName?: string;
  trackName: string;
}): string {
  const artist = (entry.artistName ?? '').trim().toLowerCase();
  const track = entry.trackName.trim().toLowerCase();
  return `${artist}\u0000${track}`;
}

/**
 * Next shuffled batch from the current pool, excluding already attempted keys.
 * When the preferred pool is exhausted, expand bounds and continue.
 */
export function nextCatalogBatch<
  T extends { trackName: string; artistName?: string },
>(
  entries: T[],
  mode: PopularityModeValue,
  needed: number,
  attemptedKeys: Set<string>,
  bounds: { start: number; end: number },
  random: () => number = Math.random,
): {
  batch: T[];
  bounds: { start: number; end: number };
  exhausted: boolean;
} {
  if (entries.length === 0 || needed <= 0) {
    return { batch: [], bounds, exhausted: true };
  }

  let current = bounds;
  const budget = catalogCandidateBudget(needed);

  for (;;) {
    const pool = entries.slice(current.start, current.end);
    const fresh = pool.filter(
      (entry) => !attemptedKeys.has(catalogEntryKey(entry)),
    );
    if (fresh.length > 0) {
      return {
        batch: shuffleCopy(fresh, random).slice(
          0,
          Math.min(fresh.length, budget),
        ),
        bounds: current,
        exhausted: false,
      };
    }

    const expanded = expandCatalogPoolBounds(entries.length, mode, current);
    if (!expanded) {
      return { batch: [], bounds: current, exhausted: true };
    }
    current = expanded;
  }
}

/**
 * Pick a shuffled candidate window from a Last.fm-ordered chart.
 *
 * - popular: random from the first 40% (expands downward if the pool is smaller than budget)
 * - balanced: random from the full chart
 * - rarities: random from the last 40% (60–100%; expands upward if needed)
 */
export function sliceCatalogWindow<T>(
  entries: T[],
  mode: PopularityModeValue,
  needed: number,
  random: () => number = Math.random,
): T[] {
  if (entries.length === 0 || needed <= 0) return [];

  const budget = catalogCandidateBudget(needed);
  let bounds = catalogPoolBounds(entries.length, mode);

  while (bounds.end - bounds.start < budget) {
    const expanded = expandCatalogPoolBounds(entries.length, mode, bounds);
    if (!expanded) break;
    bounds = expanded;
  }

  const pool = entries.slice(bounds.start, bounds.end);
  if (pool.length === 0) return [];
  return shuffleCopy(pool, random).slice(0, Math.min(pool.length, budget));
}
