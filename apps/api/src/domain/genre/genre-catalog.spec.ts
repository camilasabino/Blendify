import {
  GENRE_LABELS,
  GENRE_REGIONS,
  genreLookupKey,
} from '@blendify/contracts';
import genreSearchAliases from './data/genre-search-aliases.json';
import musicBrainzGenres from './data/musicbrainz-genres.json';
import {
  findGenre,
  GENRE_CATALOG,
  genreTrackGroupKey,
  getExploreSuggestions,
  listMainGenres,
  searchGenres,
  toGenreDto,
} from './genre-catalog';
import { splitRegionalGenreExpression } from './genre-regions';

const CANONICAL_KEYS = new Set(GENRE_CATALOG.map((g) => genreLookupKey(g.id)));

describe('MusicBrainz genre catalog', () => {
  it('uses every snapshot genre name verbatim as the canonical id', () => {
    expect(GENRE_CATALOG.map((genre) => genre.id)).toEqual(
      musicBrainzGenres.genres,
    );
    expect(findGenre('alternative rock')?.id).toBe('alternative rock');
    expect(findGenre('forró')?.id).toBe('forró');
  });

  it.each([
    ['alternative rock', 'alternative rock'],
    ['Rock Alternativo', 'alternative rock'],
    ['  rock   alternativo ', 'alternative rock'],
    ['música clássica', 'classical'],
    ['musica clasica', 'classical'],
    ['baladas', 'ballad'],
    ['FORRO', 'forró'],
    ['alternative-rock', 'alternative rock'],
  ])('resolves %p to the canonical genre %p', (input, canonical) => {
    expect(findGenre(input)?.id).toBe(canonical);
  });

  it.each(['rock argentino', 'definitely not a genre', '', '   '])(
    'leaves %p unresolved',
    (input) => {
      expect(findGenre(input)).toBeUndefined();
    },
  );

  it('does not guess between genres that differ only by diacritics', () => {
    expect(findGenre('kasékò')?.id).toBe('kasékò');
    expect(findGenre('kaseko')?.id).toBe('kaseko');
    expect(findGenre('KASÉKÒ')?.id).toBe('kasékò');
    expect(findGenre('kasekò')).toBeUndefined();
  });

  it('exposes localized labels with a canonical fallback name', () => {
    expect(toGenreDto(findGenre('alternative rock')!)).toEqual({
      id: 'alternative rock',
      name: 'Alternative Rock',
      labels: { es: 'Rock alternativo', pt: 'Rock alternativo' },
    });
    expect(toGenreDto(findGenre('korean ballad')!).labels).toEqual({
      es: 'Balada coreana',
      pt: 'Balada coreana',
    });
    expect(toGenreDto(findGenre('bossa nova')!)).toEqual({
      id: 'bossa nova',
      name: 'Bossa Nova',
    });
  });

  it('searches by canonical name and by localized aliases', () => {
    expect(searchGenres('jazz', 8).some((g) => g.id === 'jazz')).toBe(true);
    expect(searchGenres('rock alternativo', 3)[0]?.id).toBe('alternative rock');
    expect(searchGenres('eletronica', 3)[0]?.id).toBe('electronic');
    expect(searchGenres('fassafsa', 8)).toEqual([]);
    expect(searchGenres('  ', 4)).toEqual(listMainGenres().slice(0, 4));
  });

  it('features only genres present in the snapshot', () => {
    expect(listMainGenres().length).toBeGreaterThan(20);
    expect(listMainGenres().every((g) => findGenre(g.id) === g)).toBe(true);
  });

  it('explores related genres without returning the selection', () => {
    expect(getExploreSuggestions([])).toEqual({ genres: [], hasMore: false });

    const first = getExploreSuggestions(['jazz'], { limit: 2, offset: 0 });
    const second = getExploreSuggestions(['jazz'], { limit: 2, offset: 2 });
    expect(first.genres).toHaveLength(2);
    expect(first.genres.every((g) => g.id !== 'jazz')).toBe(true);
    expect(second.genres[0]?.id).not.toBe(first.genres[0]?.id);
    expect(genreTrackGroupKey('jazz')).toBe('genre:jazz');
  });
});

describe('genre localizations', () => {
  const localized = [
    ...new Set([
      ...Object.keys(GENRE_LABELS),
      ...Object.keys(genreSearchAliases),
    ]),
  ];

  it.each(localized)('localizes %s, a snapshot genre', (genre) => {
    expect(findGenre(genre)?.id).toBe(genre);
  });

  it.each([
    ['balada oriental', 'oriental ballad'],
    ['Balada Coreana', 'korean ballad'],
    ['balada latina', 'latin ballad'],
    ['rock alternativo', 'alternative rock'],
    ['música clássica', 'classical'],
    ['metal sinfônico', 'symphonic metal'],
  ])('resolves the localized label %p to %p', (label, canonical) => {
    expect(findGenre(label)?.id).toBe(canonical);
    expect(searchGenres(label, 3)[0]?.id).toBe(canonical);
  });

  it('never shadows a canonical genre, another genre or a region', () => {
    const owners = new Map<string, string>();
    for (const genre of GENRE_CATALOG) {
      for (const term of [...Object.values(genre.labels), ...genre.aliases]) {
        const key = genreLookupKey(term);
        if (key !== genreLookupKey(genre.id)) {
          expect([term, CANONICAL_KEYS.has(key)]).toEqual([term, false]);
        }
        expect([term, owners.get(key) ?? genre.id]).toEqual([term, genre.id]);
        expect([
          term,
          splitRegionalGenreExpression(term)?.genreExpression,
        ]).not.toEqual([term, '']);
        owners.set(key, genre.id);
      }
    }
    expect(GENRE_REGIONS.length).toBe(12);
  });
});
