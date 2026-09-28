import { MAX_GENRES } from '@/domain/constants';
import { findCuratedGenre, searchCuratedGenres } from './curated-genres';
import { resolveGenreExpression } from './genre-expression-resolution';

function resolvedIds(expression: string): string[] {
  const resolution = resolveGenreExpression(expression);
  return resolution.status === 'resolved'
    ? resolution.genres.map((genre) => genre.id)
    : [];
}

describe('resolveGenreExpression', () => {
  it('characterizes why exact-only lookup lost semantic genre expressions', () => {
    expect(findCuratedGenre('rock argentino')).toBeUndefined();
    expect(findCuratedGenre('instrumental')).toBeUndefined();
    expect(findCuratedGenre('argentine rock')?.id).toBe('argentine-rock');
  });

  it.each([
    ['argentine rock', 'argentine-rock'],
    ['Argentine Rock', 'argentine-rock'],
    ['argentine-rock', 'argentine-rock'],
    ['  ARGENTINE   rock ', 'argentine-rock'],
    ['instrumental acoustic guitar', 'instrumental-acoustic-guitar'],
    ['Rock en Español', 'rock-en-espanol'],
    ['rock en espanol', 'rock-en-espanol'],
    ['post rock', 'post-rock'],
    ['R&B', 'r-b'],
    ['MPB', 'mpb'],
    ['brazilian jazz', 'brazilian-jazz'],
    ['rock nacional', 'rock-nacional'],
    ['indie pop', 'indie-pop'],
  ])('resolves %s exactly to one curated genre', (expression, id) => {
    expect(resolveGenreExpression(expression)).toMatchObject({
      status: 'resolved',
      match: 'exact',
    });
    expect(resolvedIds(expression)).toEqual([id]);
  });

  it('lets an exact supported genre win over its many microgenres', () => {
    expect(resolvedIds('rock')).toEqual(['rock']);
    expect(resolvedIds('latin')).toEqual(['latin']);
    expect(resolvedIds('indie rock')).toEqual(['indie-rock']);
  });

  it('expands a style with no exact entry to every clear family member', () => {
    expect(resolveGenreExpression('acoustic guitar')).toMatchObject({
      status: 'resolved',
      match: 'style_family',
    });
    expect(resolvedIds('acoustic guitar')).toEqual([
      'acoustic-guitar-cover',
      'instrumental-acoustic-guitar',
    ]);
  });

  it('orders expanded members deterministically by catalog order', () => {
    const first = resolvedIds('Acoustic Guitar');
    const second = resolvedIds('acoustic   guitar');

    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(first.length);
  });

  it.each([
    ['argentine pop', 'pop-argentino'],
    ['Argentine Trap', 'trap-argentino'],
    ['argentine folklore', 'folklore-argentino'],
    ['brazilian trap', 'trap-brasileiro'],
    ['brazilian popular music', 'mpb'],
    ['Brazilian funk', 'funk-carioca'],
    ['latin trap', 'trap-latino'],
  ])(
    'resolves the English form %s to the established local genre',
    (expression, id) => {
      expect(resolveGenreExpression(expression)).toMatchObject({
        status: 'resolved',
        match: 'alias',
      });
      expect(resolvedIds(expression)).toEqual([id]);
    },
  );

  it.each([
    ['pop argentino', 'pop-argentino'],
    ['Trap Argentino', 'trap-argentino'],
    ['folklore argentino', 'folklore-argentino'],
    ['trap brasileiro', 'trap-brasileiro'],
    ['funk carioca', 'funk-carioca'],
    ['trap latino', 'trap-latino'],
  ])('keeps resolving the local name %s exactly', (expression, id) => {
    expect(resolveGenreExpression(expression)).toMatchObject({
      status: 'resolved',
      match: 'exact',
    });
    expect(resolvedIds(expression)).toEqual([id]);
  });

  it('resolves instrumental to its curated representative genres', () => {
    for (const expression of [
      'instrumental',
      'Instrumental',
      ' INSTRUMENTAL ',
    ]) {
      expect(resolveGenreExpression(expression)).toMatchObject({
        status: 'resolved',
        match: 'curated_family',
      });
      expect(resolvedIds(expression)).toEqual([
        'instrumental-hip-hop',
        'instrumental-rock',
        'instrumental-funk',
        'instrumental-soul',
        'instrumental-acoustic-guitar',
      ]);
    }
  });

  it('lets an exact instrumental genre win over the instrumental family', () => {
    expect(resolvedIds('instrumental acoustic guitar')).toEqual([
      'instrumental-acoustic-guitar',
    ]);
    expect(resolvedIds('instrumental rock')).toEqual(['instrumental-rock']);
  });

  it.each(['acoustic', 'argentine', 'brazilian'])(
    'reports %s as ambiguous instead of truncating more than MAX_GENRES members',
    (expression) => {
      expect(resolveGenreExpression(expression)).toEqual({
        status: 'ambiguous',
        expression,
      });
      expect(searchCuratedGenres(expression, 100).length).toBeGreaterThan(
        MAX_GENRES,
      );
    },
  );

  it('never picks one specialization as the meaning of a broader expression', () => {
    expect(resolveGenreExpression('musica instrumental')).toEqual({
      status: 'unknown',
      expression: 'musica instrumental',
    });
    expect(
      searchCuratedGenres('musica instrumental', 1).map((genre) => genre.id),
    ).toEqual(['musica-instrumental-cristiana']);
  });

  it.each(['rock argentino', 'argentine folk rock', 'rock surf latin'])(
    'rejects %s when its tokens only overlap catalog genres partially',
    (expression) => {
      expect(resolveGenreExpression(expression)).toEqual({
        status: 'unknown',
        expression,
      });
    },
  );

  it.each([
    'definitely not a genre',
    'glorptrance',
    '',
    '   ',
    'custom:acid%20jazz',
    'custom:rock',
  ])('keeps %p unknown', (expression) => {
    expect(resolveGenreExpression(expression)).toEqual({
      status: 'unknown',
      expression,
    });
  });
});
