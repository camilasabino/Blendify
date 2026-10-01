import { orderBySimilarityRankingBands } from './similar-artist-ranking-bands';

const ranks = (count: number): number[] =>
  Array.from({ length: count }, (_, index) => index + 1);

function band(rank: number): 'head' | 'middle' | 'tail' {
  if (rank <= 10) {
    return 'head';
  }
  return rank <= 25 ? 'middle' : 'tail';
}

function bandCounts(ordered: number[]): Record<string, number> {
  const counts: Record<string, number> = { head: 0, middle: 0, tail: 0 };
  for (const rank of ordered) {
    counts[band(rank)] += 1;
  }
  return counts;
}

describe('orderBySimilarityRankingBands', () => {
  const ordered = orderBySimilarityRankingBands(ranks(40));

  it('keeps every candidate exactly once', () => {
    expect([...ordered].sort((a, b) => a - b)).toEqual(ranks(40));
  });

  it('lets each band contribute within the first three candidates', () => {
    expect(new Set(ordered.slice(0, 3).map(band))).toEqual(
      new Set(['head', 'middle', 'tail']),
    );
  });

  it('splits the candidates roughly 50/30/20 with the head strongest', () => {
    expect(bandCounts(ordered.slice(0, 10))).toEqual({
      head: 5,
      middle: 3,
      tail: 2,
    });

    const firstTwelve = bandCounts(ordered.slice(0, 12));
    expect(firstTwelve.head).toBeGreaterThan(firstTwelve.middle);
    expect(firstTwelve.middle).toBeGreaterThan(firstTwelve.tail);
    expect(firstTwelve.tail).toBeGreaterThan(0);
  });

  it('preserves the Last.fm order inside each band', () => {
    for (const name of ['head', 'middle', 'tail'] as const) {
      const inBand = ordered.filter((rank) => band(rank) === name);
      expect(inBand).toEqual([...inBand].sort((a, b) => a - b));
    }
  });

  it('keeps the plain ranking when only the head is available', () => {
    expect(orderBySimilarityRankingBands(ranks(8))).toEqual(ranks(8));
  });

  it('continues through the remaining bands once one runs out', () => {
    const short = orderBySimilarityRankingBands(ranks(14));

    expect(short.slice(0, 3)).toEqual([1, 11, 2]);
    expect([...short].sort((a, b) => a - b)).toEqual(ranks(14));
  });
});
