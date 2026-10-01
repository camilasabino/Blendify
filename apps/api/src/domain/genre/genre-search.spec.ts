import { listMainGenres } from './genre-catalog';
import { searchGenres } from './genre-search';

function ids(query: string, limit = 16): string[] {
  return searchGenres(query, limit).map((genre) => genre.id);
}

describe('searchGenres', () => {
  it.each(['corrido tumbado', 'corridos tumbados', 'corridos tumbado'])(
    'ranks Corrido Tumbado first for %p',
    (query) => {
      expect(ids(query)[0]).toBe('corrido tumbado');
    },
  );

  it.each([
    ['ranchera', 'ranchera'],
    ['rancheras', 'ranchera'],
    ['sertanejos', 'sertanejo'],
    ['baladas', 'ballad'],
    ['rock alternativo', 'alternative rock'],
  ])('ranks the known genre behind %p first', (query, genre) => {
    expect(ids(query)[0]).toBe(genre);
  });

  it('keeps an exact match ahead of every other suggestion', () => {
    expect(ids('blues').slice(0, 2)).toEqual(['blues', 'blues rock']);
    expect(ids('rock')[0]).toBe('rock');
  });

  it('extends a singularized query to the genres it prefixes', () => {
    expect(ids('sambas').slice(0, 3)).toEqual([
      'samba',
      'sambass',
      'samba rap',
    ]);
  });

  it.each([
    ['corrdo tumbado', 'corrido tumbado'],
    ['alternatve rock', 'alternative rock'],
    ['trnace', 'trance'],
    ['metak', 'metal'],
    ['cumbia argentino', 'cumbia argentina'],
  ])('suggests %p as a typo of %p', (query, genre) => {
    expect(ids(query)[0]).toBe(genre);
  });

  it('suggests typo matches for a word still being typed', () => {
    expect(ids('alternatve')).toEqual(
      expect.arrayContaining(['alternative rock', 'alternative pop']),
    );
  });

  it.each(['glorptrance', 'qwertyui', 'rokc', 'fassafsa'])(
    'returns no suggestion for the unrelated query %p',
    (query) => {
      expect(ids(query)).toEqual([]);
    },
  );

  it('does not add typo neighbours beside an exact or plural match', () => {
    expect(ids('salsa')).not.toContain('valsa brasileira');
    expect(ids('valsa')).toContain('salsa');
    expect(ids('alternative rock')).not.toContain('alternative folk');
  });

  it('does not stretch short words or distant spellings into typos', () => {
    expect(ids('acid rokc')[0]).not.toBe('acid rock');
    expect(ids('cumbia americana')[0]).toBe('cumbia');
  });

  it('falls back to the featured genres for a blank query', () => {
    expect(searchGenres('  ', 4)).toEqual(listMainGenres().slice(0, 4));
  });
});
