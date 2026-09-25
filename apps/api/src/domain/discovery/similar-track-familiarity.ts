import type { PopularityMode } from '@blendify/contracts';
import {
  catalogCandidateBudget,
  sliceCatalogWindow,
} from '../genre/catalog-window';

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
  if (budget === 0 || candidates.length === 0) return [];

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
  const selected = sliceCatalogWindow(rankedKnown, mode, needed, random);
  const fallback = unknown.slice(0, Math.max(0, budget - selected.length));

  return [...selected, ...fallback];
}
