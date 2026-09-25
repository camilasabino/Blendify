import { PopularityMode } from '@blendify/contracts';
import { catalogCandidateBudget } from '../genre/catalog-window';
import { selectSimilarTrackCandidates } from './similar-track-familiarity';

type Candidate = { name: string; playcount?: number };

function knownPool(size: number): Candidate[] {
  return Array.from({ length: size }, (_, index) => ({
    name: `t${index}`,
    playcount: (index * 7919) % 1000,
  }));
}

function byPlaycountDesc(pool: Candidate[]): string[] {
  return pool
    .map((candidate, index) => ({ candidate, index }))
    .sort(
      (a, b) =>
        (b.candidate.playcount ?? 0) - (a.candidate.playcount ?? 0) ||
        a.index - b.index,
    )
    .map((entry) => entry.candidate.name);
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16_807) % 2_147_483_647;
    return state / 2_147_483_647;
  };
}

const SEEDS = [1, 7, 42, 1234, 98765];

describe('selectSimilarTrackCandidates', () => {
  const pool = knownPool(100);
  const ranked = byPlaycountDesc(pool);
  const needed = 15;
  const budget = catalogCandidateBudget(needed);

  it('draws popular candidates only from the upper playcount window', () => {
    const upper = new Set(ranked.slice(0, 40));
    for (const seed of SEEDS) {
      const picked = selectSimilarTrackCandidates(
        pool,
        PopularityMode.POPULAR,
        needed,
        seededRandom(seed),
      );
      expect(picked).toHaveLength(budget);
      expect(picked.every((candidate) => upper.has(candidate.name))).toBe(true);
    }
  });

  it('draws rarities candidates only from the lower playcount window', () => {
    const lower = new Set(ranked.slice(60));
    for (const seed of SEEDS) {
      const picked = selectSimilarTrackCandidates(
        pool,
        PopularityMode.RARITIES,
        needed,
        seededRandom(seed),
      );
      expect(picked).toHaveLength(budget);
      expect(picked.every((candidate) => lower.has(candidate.name))).toBe(true);
    }
  });

  it('never overlaps popular and rarities while both windows fill the budget', () => {
    const popular = selectSimilarTrackCandidates(
      pool,
      PopularityMode.POPULAR,
      needed,
      seededRandom(3),
    ).map((candidate) => candidate.name);
    const rarities = new Set(
      selectSimilarTrackCandidates(
        pool,
        PopularityMode.RARITIES,
        needed,
        seededRandom(3),
      ).map((candidate) => candidate.name),
    );
    expect(popular.some((name) => rarities.has(name))).toBe(false);
  });

  it('lets balanced draw from the full known-playcount pool', () => {
    const upper = new Set(ranked.slice(0, 40));
    const lower = new Set(ranked.slice(60));
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const picked = selectSimilarTrackCandidates(
        pool,
        PopularityMode.BALANCED,
        needed,
        seededRandom(seed),
      );
      expect(picked).toHaveLength(budget);
      for (const candidate of picked) seen.add(candidate.name);
    }
    expect([...seen].some((name) => upper.has(name))).toBe(true);
    expect([...seen].some((name) => lower.has(name))).toBe(true);
  });

  it('never returns more candidates than the resolve budget', () => {
    for (const mode of Object.values(PopularityMode)) {
      for (const target of [1, 15, 50]) {
        const picked = selectSimilarTrackCandidates(
          pool,
          mode,
          target,
          seededRandom(target),
        );
        expect(picked.length).toBeLessThanOrEqual(
          catalogCandidateBudget(target),
        );
      }
    }
  });

  it('uses original Last.fm position as tie-break for equal playcounts', () => {
    const tied: Candidate[] = Array.from({ length: 10 }, (_, index) => ({
      name: `tie${index}`,
      playcount: 500,
    }));
    const quiet: Candidate[] = Array.from({ length: 10 }, (_, index) => ({
      name: `quiet${index}`,
      playcount: 1,
    }));
    const noSwap = () => 0.999_999;

    const picked = selectSimilarTrackCandidates(
      [...quiet, ...tied],
      PopularityMode.POPULAR,
      1,
      noSwap,
    );

    expect(picked.map((candidate) => candidate.name)).toEqual(
      tied.slice(0, 9).map((candidate) => candidate.name),
    );
  });

  it('does not treat unknown playcount as rarity', () => {
    const unknown: Candidate[] = Array.from({ length: 30 }, (_, index) => ({
      name: `unknown${index}`,
    }));
    const mixed = [...unknown.slice(0, 15), ...pool, ...unknown.slice(15)];

    for (const seed of SEEDS) {
      const picked = selectSimilarTrackCandidates(
        mixed,
        PopularityMode.RARITIES,
        needed,
        seededRandom(seed),
      );
      expect(picked).toHaveLength(budget);
      expect(
        picked.some((candidate) => candidate.playcount === undefined),
      ).toBe(false);
    }
  });

  it('uses unknown-playcount candidates only to fill the remaining budget', () => {
    const known = knownPool(5);
    const unknown: Candidate[] = Array.from({ length: 30 }, (_, index) => ({
      name: `unknown${index}`,
    }));

    const picked = selectSimilarTrackCandidates(
      [...unknown.slice(0, 1), ...known, ...unknown.slice(1)],
      PopularityMode.RARITIES,
      needed,
      seededRandom(9),
    );

    expect(picked).toHaveLength(budget);
    expect(
      picked.slice(0, known.length).every((c) => c.playcount !== undefined),
    ).toBe(true);
    expect(picked.slice(known.length).map((c) => c.name)).toEqual(
      unknown.slice(0, budget - known.length).map((c) => c.name),
    );
  });

  it('keeps an explicit zero playcount as a known value', () => {
    const picked = selectSimilarTrackCandidates(
      [{ name: 'unknown' }, { name: 'zero', playcount: 0 }],
      PopularityMode.RARITIES,
      1,
      seededRandom(1),
    );
    expect(picked.map((candidate) => candidate.name)).toEqual([
      'zero',
      'unknown',
    ]);
  });

  it('treats invalid playcounts as unknown', () => {
    const picked = selectSimilarTrackCandidates(
      [
        { name: 'nan', playcount: Number.NaN },
        { name: 'negative', playcount: -1 },
        { name: 'known', playcount: 10 },
      ],
      PopularityMode.POPULAR,
      1,
      seededRandom(1),
    );
    expect(picked.map((candidate) => candidate.name)).toEqual([
      'known',
      'nan',
      'negative',
    ]);
  });
});
