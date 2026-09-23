import {
  findCuratedGenre,
  genreTrackGroupKey,
  getExploreSuggestions,
  listMainGenres,
  searchCuratedGenres,
  toGenreDto,
} from './curated-genres';

describe('curated genres', () => {
  it('finds genres by id or name', () => {
    const byId = findCuratedGenre('jazz');
    expect(byId?.spotifyGenre).toBeTruthy();

    const byName = findCuratedGenre(byId?.name ?? 'Jazz');
    expect(byName?.id).toBe(byId?.id);
  });

  it('builds custom genres from encoded ids', () => {
    const custom = findCuratedGenre('custom:acid%20jazz');
    expect(custom).toMatchObject({
      id: 'custom:acid%20jazz',
      name: 'acid jazz',
      spotifyGenre: 'acid jazz',
    });
    expect(findCuratedGenre('custom:')).toBeUndefined();
    expect(findCuratedGenre('   ')).toBeUndefined();
    expect(findCuratedGenre('custom:%')).toBeUndefined();
  });

  it('lists featured mains and maps DTOs', () => {
    const mains = listMainGenres();
    const first = mains[0];
    expect(first).toBeDefined();
    if (!first) return;
    expect(toGenreDto(first)).toEqual({
      id: first.id,
      name: first.name,
      parentId: first.parentId ?? null,
    });
    expect(genreTrackGroupKey('jazz')).toBe('genre:jazz');
  });

  it('searches by partial name', () => {
    const hits = searchCuratedGenres('jazz', 8);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((g) => g.name.toLowerCase().includes('jazz'))).toBe(true);
  });

  it('returns featured mains for blank search', () => {
    const hits = searchCuratedGenres('  ', 4);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThanOrEqual(4);
  });

  it('does not invent freeform genres outside the catalog', () => {
    const hits = searchCuratedGenres('fassafsa', 8);
    expect(hits.every((g) => !g.id.startsWith('custom:'))).toBe(true);
    expect(hits).toHaveLength(0);
  });

  it('scores multi-token queries', () => {
    const hits = searchCuratedGenres('acid jazz', 8);
    expect(hits.length).toBeGreaterThan(0);
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

  it('pages explore suggestions and handles empty selection', () => {
    expect(getExploreSuggestions([])).toEqual({ genres: [], hasMore: false });

    const seed = findCuratedGenre('jazz');
    expect(seed).toBeDefined();
    if (!seed) return;

    const first = getExploreSuggestions([seed.id], { limit: 2, offset: 0 });
    const second = getExploreSuggestions([seed.id], { limit: 2, offset: 2 });
    expect(first.genres).toHaveLength(2);
    expect(second.genres[0]?.id).not.toBe(first.genres[0]?.id);
  });

  it('explores related r&b aliases', () => {
    const seed = findCuratedGenre('r-n-b') ?? findCuratedGenre('r&b');
    if (!seed) return;
    const { genres } = getExploreSuggestions([seed.id], { limit: 8 });
    expect(genres.length).toBeGreaterThan(0);
  });
});
