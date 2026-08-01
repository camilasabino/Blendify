import {
  findCuratedGenre,
  getExploreSuggestions,
  searchCuratedGenres,
} from './curated-genres';

describe('curated genres', () => {
  it('finds genres by id or name', () => {
    const byId = findCuratedGenre('jazz');
    expect(byId?.spotifyGenre).toBeTruthy();

    const byName = findCuratedGenre(byId?.name ?? 'Jazz');
    expect(byName?.id).toBe(byId?.id);
  });

  it('searches by partial name', () => {
    const hits = searchCuratedGenres('jazz', 8);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((g) => g.name.toLowerCase().includes('jazz'))).toBe(true);
  });

  it('does not invent freeform genres outside the catalog', () => {
    const hits = searchCuratedGenres('fassafsa', 8);
    expect(hits.every((g) => !g.id.startsWith('custom:'))).toBe(true);
    expect(hits).toHaveLength(0);
  });

  it('explores related genres without returning the seed', () => {
    const seed = findCuratedGenre('jazz');
    expect(seed).toBeDefined();
    if (!seed) return;

    const { genres, hasMore } = getExploreSuggestions([seed.id], {
      limit: 6,
      offset: 0,
    });
    expect(genres.every((g) => g.id !== seed.id)).toBe(true);
    expect(typeof hasMore).toBe('boolean');
  });
});
