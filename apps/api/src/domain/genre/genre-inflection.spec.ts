import { inflectionVariants, singularTokenForms } from './genre-inflection';

describe('singularTokenForms', () => {
  it.each([
    ['rancheras', ['ranchera']],
    ['corridos', ['corrido']],
    ['tumbados', ['tumbado']],
    ['mexicanas', ['mexicana']],
    ['brasileiros', ['brasileiro']],
    ['sertanejos', ['sertanejo']],
    ['ballads', ['ballad']],
    ['espanoles', ['espanole', 'espanol']],
    ['estadounidenses', ['estadounidense', 'estadounidens']],
    ['melodies', ['melody', 'melodie']],
    ['cancoes', ['cancao', 'cancoe']],
    ['tropicais', ['tropical']],
    ['espanhois', ['espanhol']],
  ])('derives the singular lookup forms of %p', (token, forms) => {
    expect(singularTokenForms(token)).toEqual(forms);
  });

  it.each(['rock', 'bass', 'chorus', 'chaabi', 'dos', 'los', '80s', 'r&bs'])(
    'leaves %p without singular forms',
    (token) => {
      expect(singularTokenForms(token)).toEqual([]);
    },
  );
});

describe('inflectionVariants', () => {
  it('orders variants by the number of singularized tokens', () => {
    expect(inflectionVariants('corridos tumbados')).toEqual([
      'corridos tumbado',
      'corrido tumbados',
      'corrido tumbado',
    ]);
  });

  it('never repeats the input or invents variants without plural tokens', () => {
    expect(inflectionVariants('corrido tumbado')).toEqual([]);
    expect(inflectionVariants('corridos tumbado')).toEqual(['corrido tumbado']);
  });

  it('bounds the combinations generated for long plural phrases', () => {
    const phrase = 'aaaas bbbbs cccces ddddes eeeees ffffs';

    expect(inflectionVariants(phrase)).toEqual([]);
    expect(inflectionVariants('aaaas bbbbs cccces').length).toBeLessThan(32);
  });
});
