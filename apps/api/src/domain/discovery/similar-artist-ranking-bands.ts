const SIMILAR_ARTIST_RANKING_BANDS = [
  { start: 0, end: 10, weight: 5 },
  { start: 10, end: 25, weight: 3 },
  { start: 25, end: Number.POSITIVE_INFINITY, weight: 2 },
] as const;

export function orderBySimilarityRankingBands<T>(ranked: readonly T[]): T[] {
  const bands = SIMILAR_ARTIST_RANKING_BANDS.map((band) => ({
    weight: band.weight,
    queue: ranked.slice(band.start, band.end),
    credit: 0,
  }));
  const ordered: T[] = [];

  while (ordered.length < ranked.length) {
    const open = bands.filter((band) => band.queue.length > 0);
    const totalWeight = open.reduce((sum, band) => sum + band.weight, 0);
    for (const band of open) {
      band.credit += band.weight;
    }

    const next = open.reduce(
      (best, band) => (band.credit > best.credit ? band : best),
      open[0],
    );
    next.credit -= totalWeight;
    ordered.push(next.queue.shift() as T);
  }

  return ordered;
}
