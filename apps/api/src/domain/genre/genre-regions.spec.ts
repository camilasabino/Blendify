import { GENRE_REGIONS } from '@blendify/contracts';
import { splitRegionalGenreExpression } from './genre-regions';

describe('splitRegionalGenreExpression', () => {
  it.each([
    ['Brasil', 'brazilian'],
    ['Brazil', 'brazilian'],
    ['brasileiro', 'brazilian'],
    ['Reino Unido', 'british'],
    ['United Kingdom', 'british'],
    ['Latinoamérica', 'latin'],
    ['Latin America', 'latin'],
    ['América Latina', 'latin'],
    ['  ESPAÑA ', 'spanish'],
    ['Perú', 'peru'],
  ])(
    'resolves the region label %p to the canonical tag %p',
    (label, region) => {
      expect(splitRegionalGenreExpression(`rock ${label}`)).toEqual({
        region,
        genreExpression: 'rock',
      });
    },
  );

  it('keeps every canonical tag resolvable to itself', () => {
    expect(
      GENRE_REGIONS.map(
        (region) => splitRegionalGenreExpression(`pop ${region}`)?.region,
      ),
    ).toEqual([...GENRE_REGIONS]);
  });

  it.each([
    ['rock argentino', 'argentina', 'rock'],
    ['rock da argentina', 'argentina', 'rock'],
    ['Brazilian pop', 'brazilian', 'pop'],
    ['baladas latino-americanas', 'latin', 'baladas'],
    ['latin american ballads', 'latin', 'ballads'],
    ['rock británico', 'british', 'rock'],
  ])('splits %p into %p + %p', (expression, region, genreExpression) => {
    expect(splitRegionalGenreExpression(expression)).toEqual({
      region,
      genreExpression,
    });
  });

  it.each(['alternative rock', 'europe rock', ''])(
    'returns null without a regional modifier in %p',
    (expression) => {
      expect(splitRegionalGenreExpression(expression)).toBeNull();
    },
  );
});
