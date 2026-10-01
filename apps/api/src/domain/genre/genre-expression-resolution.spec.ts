import { resolveGenreExpression } from './genre-expression-resolution';

function resolved(expression: string) {
  const resolution = resolveGenreExpression(expression);
  return resolution.status === 'resolved'
    ? {
        genres: resolution.genres.map((genre) => genre.id),
        region: resolution.region,
      }
    : resolution.status;
}

describe('resolveGenreExpression', () => {
  it.each([
    ['rock', 'rock'],
    ['Alternative Rock', 'alternative rock'],
    ['rock alternativo', 'alternative rock'],
    ['MPB', 'mpb'],
    ['música popular brasileira', 'mpb'],
    ['rap', 'hip hop'],
    ['latin', 'latin'],
  ])('resolves %p to one canonical genre', (expression, genre) => {
    expect(resolved(expression)).toEqual({
      genres: [genre],
      region: undefined,
    });
  });

  it.each([
    ['rock argentino', 'rock', 'argentina'],
    ['argentinian rock', 'rock', 'argentina'],
    ['rock da argentina', 'rock', 'argentina'],
    ['baladas latinas', 'ballad', 'latin'],
    ['latin ballads', 'ballad', 'latin'],
    ['baladas latino-americanas', 'ballad', 'latin'],
    ['pop brasileiro', 'pop', 'brazilian'],
    ['Brazilian pop', 'pop', 'brazilian'],
    ['pop de Brasil', 'pop', 'brazilian'],
    ['rock británico', 'rock', 'british'],
    ['British rock', 'rock', 'british'],
    ['rock britânico', 'rock', 'british'],
    ['latin rock', 'rock', 'latin'],
    ['rock español', 'rock', 'spanish'],
  ])(
    'separates %p into genre %p and region %p',
    (expression, genre, region) => {
      expect(resolved(expression)).toEqual({ genres: [genre], region });
    },
  );

  it('keeps a canonical genre whose remainder is not a genre', () => {
    expect(resolved('brazilian bass')).toEqual({
      genres: ['brazilian bass'],
      region: undefined,
    });
  });

  it.each(['argentina', 'brazilian', 'argentine glorptrance'])(
    'never turns a region alone into a genre: %p',
    (expression) => {
      expect(resolved(expression)).toBe('unknown');
    },
  );

  it.each(['definitely not a genre', 'glorptrance', '', '   '])(
    'keeps %p unknown',
    (expression) => {
      expect(resolved(expression)).toBe('unknown');
    },
  );
});
