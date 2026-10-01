import { GENRE_REGIONS } from '@blendify/contracts';
import genreRegionAliases from './data/genre-region-aliases.json';
import { splitRegionalGenreExpression } from './genre-regions';

describe('splitRegionalGenreExpression', () => {
  it.each([
    ['Brasil', 'brazilian'],
    ['Brazil', 'brazilian'],
    ['brasileiro', 'brazilian'],
    ['Reino Unido', 'british'],
    ['United Kingdom', 'british'],
    ['UK', 'british'],
    ['U.K.', 'british'],
    ['Britain', 'british'],
    ['Great Britain', 'british'],
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
    ['argentinos', 'argentina'],
    ['argentinas', 'argentina'],
    ['brasileiros', 'brazilian'],
    ['brasileiras', 'brazilian'],
    ['británicos', 'british'],
    ['británicas', 'british'],
    ['britânicos', 'british'],
    ['mexicanas', 'mexico'],
    ['latino-americanos', 'latin'],
    ['estadounidenses', 'american'],
    ['españoles', 'spanish'],
    ['espanhóis', 'spanish'],
  ])('resolves the plural region form %p to %p', (label, region) => {
    expect(splitRegionalGenreExpression(`rock ${label}`)).toEqual({
      region,
      genreExpression: 'rock',
    });
  });

  it('resolves the plural of every region alias to the same region', () => {
    const strays = GENRE_REGIONS.flatMap((region) =>
      genreRegionAliases[region]
        .filter((alias) => /[aeo]$/.test(alias))
        .map((alias) => [
          alias,
          splitRegionalGenreExpression(`rock ${alias}s`)?.region,
        ])
        .filter(([, found]) => found !== region),
    );

    expect(strays).toEqual([]);
  });

  it.each([
    ['rock argentino', 'argentina', 'rock'],
    ['rock da argentina', 'argentina', 'rock'],
    ['Brazilian pop', 'brazilian', 'pop'],
    ['baladas latino-americanas', 'latin', 'baladas'],
    ['latin american ballads', 'latin', 'ballads'],
    ['rock británico', 'british', 'rock'],
    ['pop rock r&b británicos', 'british', 'pop rock r&b'],
    ['pop rock r&b de uk', 'british', 'pop rock r&b'],
    ['rock de UK', 'british', 'rock'],
    ['UK rock', 'british', 'rock'],
    ['rock del Reino Unido', 'british', 'rock'],
    ['rock from the UK', 'british', 'rock'],
    ['rock from the United Kingdom', 'british', 'rock'],
    ['rock de argentina', 'argentina', 'rock'],
    ['pop do Brasil', 'brazilian', 'pop'],
    ['pop from Brazil', 'brazilian', 'pop'],
    ['rock en UK', 'british', 'rock'],
    ['rock en Reino Unido', 'british', 'rock'],
    ['rock in the UK', 'british', 'rock'],
    ['rock in United Kingdom', 'british', 'rock'],
    ['pop en Argentina', 'argentina', 'pop'],
    ['indie rock in Brazil', 'brazilian', 'indie rock'],
    ['kasekòs mexicanos', 'mexico', 'kasekòs'],
    ['Forró do Brasil', 'brazilian', 'forró'],
    ['Música Clássica brasileira', 'brazilian', 'música clássica'],
    ['electrónica de Argentina', 'argentina', 'electrónica'],
  ])('splits %p into %p + %p', (expression, region, genreExpression) => {
    expect(splitRegionalGenreExpression(expression)).toEqual({
      region,
      genreExpression,
    });
  });

  it.each([
    'alternative rock',
    'europe rock',
    'ukulele pop',
    'duke rock',
    'britpop',
    'tragédie en musique',
    'indie rock',
    'rock ukes',
    '',
  ])('returns null without a regional modifier in %p', (expression) => {
    expect(splitRegionalGenreExpression(expression)).toBeNull();
  });
});
