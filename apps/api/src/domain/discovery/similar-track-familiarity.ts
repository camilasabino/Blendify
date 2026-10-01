import type { PopularityMode } from '@blendify/contracts';
import {
  CatalogChartCursor,
  catalogCandidateBudget,
  sliceCatalogWindow,
} from '@/domain/genre/catalog-window';

function knownPlaycount(playcount: number | undefined): number | null {
  return typeof playcount === 'number' &&
    Number.isFinite(playcount) &&
    playcount >= 0
    ? playcount
    : null;
}

export function selectSimilarTrackCandidates<T extends { playcount?: number }>(
  candidates: T[],
  mode: PopularityMode,
  needed: number,
  random: () => number = Math.random,
): T[] {
  const budget = catalogCandidateBudget(needed);
  if (budget === 0 || candidates.length === 0) {
    return [];
  }

  const { rankedKnown, unknown } = splitByPlaycount(candidates);
  const selected = sliceCatalogWindow(rankedKnown, mode, needed, random);
  const fallback = unknown.slice(0, Math.max(0, budget - selected.length));

  return [...selected, ...fallback];
}

/**
 * Every candidate in resolve order: the familiarity window first, then the
 * rest of the known playcounts in pool-expansion order, then unknown
 * playcounts.
 */
export function orderSimilarTrackCandidates<T extends { playcount?: number }>(
  candidates: T[],
  mode: PopularityMode,
  needed: number,
  random: () => number = Math.random,
): T[] {
  const window = selectSimilarTrackCandidates(candidates, mode, needed, random);
  const chosen = new Set(window);
  const { rankedKnown, unknown } = splitByPlaycount(candidates);
  const entries = rankedKnown.map((candidate, index) => ({
    trackName: String(index),
    candidate,
  }));
  const cursor = new CatalogChartCursor(entries, mode, random);
  const expanded: T[] = [];

  for (const entry of entries) {
    if (chosen.has(entry.candidate)) {
      cursor.markAttempted(entry);
    }
  }
  for (
    let batch = cursor.next(entries.length);
    batch.length > 0;
    batch = cursor.next(entries.length)
  ) {
    for (const entry of batch) {
      cursor.markAttempted(entry);
      expanded.push(entry.candidate);
    }
  }

  return [
    ...window,
    ...expanded,
    ...unknown.filter((candidate) => !chosen.has(candidate)),
  ];
}

function splitByPlaycount<T extends { playcount?: number }>(
  candidates: T[],
): { rankedKnown: T[]; unknown: T[] } {
  const known: Array<{ candidate: T; index: number; playcount: number }> = [];
  const unknown: T[] = [];
  candidates.forEach((candidate, index) => {
    const playcount = knownPlaycount(candidate.playcount);
    if (playcount === null) {
      unknown.push(candidate);
    } else {
      known.push({ candidate, index, playcount });
    }
  });

  const rankedKnown = known
    .sort((a, b) => b.playcount - a.playcount || a.index - b.index)
    .map((entry) => entry.candidate);
  return { rankedKnown, unknown };
}
