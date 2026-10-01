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
    ['blues', 'blues'],
    ['ballads', 'ballad'],
    ['baladas', 'ballad'],
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
    ['r&b de uk', 'r&b', 'british'],
    ['UK pop', 'pop', 'british'],
    ['rock del Reino Unido', 'rock', 'british'],
    ['rock from the UK', 'rock', 'british'],
    ['rock de argentina', 'rock', 'argentina'],
    ['pop do Brasil', 'pop', 'brazilian'],
    ['rock en UK', 'rock', 'british'],
    ['rock en Reino Unido', 'rock', 'british'],
    ['rock in the UK', 'rock', 'british'],
    ['rock in United Kingdom', 'rock', 'british'],
    ['indie rock en UK', 'indie rock', 'british'],
  ])(
    'separates %p into genre %p and region %p',
    (expression, genre, region) => {
      expect(resolved(expression)).toEqual({ genres: [genre], region });
    },
  );

  it.each([
    ['rancheras', 'ranchera'],
    ['corridos tumbados', 'corrido tumbado'],
    ['corridos tumbado', 'corrido tumbado'],
    ['corrido tumbados', 'corrido tumbado'],
    ['sertanejos', 'sertanejo'],
    ['bossa novas', 'bossa nova'],
  ])('resolves the plural %p to one canonical genre', (expression, genre) => {
    expect(resolveGenreExpression(expression)).toMatchObject({
      status: 'resolved',
      match: 'inflected',
      genres: [{ id: genre }],
    });
    expect(resolved(expression)).toEqual({
      genres: [genre],
      region: undefined,
    });
  });

  it.each([
    ['ranchera mexicana', 'ranchera', 'mexico'],
    ['rancheras mexicanas', 'ranchera', 'mexico'],
    ['corridos tumbados de México', 'corrido tumbado', 'mexico'],
    ['cumbias colombianas', 'cumbia', 'colombia'],
    ['tangos argentinos', 'tango', 'argentina'],
    ['rock argentinos', 'rock', 'argentina'],
    ['pop argentinas', 'pop', 'argentina'],
    ['rock brasileiros', 'rock', 'brazilian'],
    ['sambas brasileiras', 'samba', 'brazilian'],
    ['rock británicos', 'rock', 'british'],
    ['baladas británicas', 'ballad', 'british'],
    ['rock españoles', 'rock', 'spanish'],
    ['rock espanhóis', 'rock', 'spanish'],
  ])(
    'separates the inflected %p into genre %p and region %p',
    (expression, genre, region) => {
      expect(resolved(expression)).toEqual({ genres: [genre], region });
    },
  );

  it.each([
    ['kasékò', 'kasékò'],
    ['kaseko', 'kaseko'],
  ])('resolves the exact spelling %p to %p', (expression, genre) => {
    expect(resolveGenreExpression(expression)).toMatchObject({
      status: 'resolved',
      match: 'exact',
      genres: [{ id: genre }],
    });
  });

  it.each([
    'kasekò',
    'kasekò mexicano',
    'kasekòs',
    'kasekòs mexicanos',
    'kasekòs de México',
  ])('classifies the normalization collision %p as ambiguous', (expression) => {
    expect(resolved(expression)).toBe('ambiguous');
  });

  it.each([
    ['UK garages', 'uk garage'],
    ['regional mexicanos', 'regional mexicano'],
  ])(
    'keeps the plural of the canonical regional genre %p whole',
    (expression, genre) => {
      expect(resolved(expression)).toEqual({
        genres: [genre],
        region: undefined,
      });
    },
  );

  it.each(['kasekòs', 'kasekòs mexicanos', 'kasekòs de México'])(
    'asks instead of guessing between the genres %p can stand for',
    (expression) => {
      expect(resolved(expression)).toBe('ambiguous');
    },
  );

  it.each([
    ['kasékò mexicano', 'kasékò', 'mexico'],
    ['kaseko mexicano', 'kaseko', 'mexico'],
    ['forró brasileiro', 'forró', 'brazilian'],
    ['Forró do Brasil', 'forró', 'brazilian'],
    ['electrónica argentina', 'electronic', 'argentina'],
    ['electronica argentina', 'electronica', 'argentina'],
    ['música clássica brasileira', 'classical', 'brazilian'],
  ])(
    'keeps the accents of %p when resolving its genre beside the region',
    (expression, genre, region) => {
      expect(resolved(expression)).toEqual({ genres: [genre], region });
    },
  );

  it.each(['kasékò', 'kaseko', 'electrónica', 'electronica', 'kasekòs'])(
    'resolves %p the same with or without a region',
    (genreExpression) => {
      const alone = resolveGenreExpression(genreExpression);
      const regional = resolveGenreExpression(`${genreExpression} mexicano`);

      expect(regional.status).toBe(alone.status);
      expect(
        regional.status === 'resolved' && regional.genres.map((g) => g.id),
      ).toEqual(alone.status === 'resolved' && alone.genres.map((g) => g.id));
    },
  );

  it.each(['corrdo tumbado', 'alternatve rock', 'metalcore-ish', 'trnace'])(
    'never resolves the approximate spelling %p automatically',
    (expression) => {
      expect(resolved(expression)).toBe('unknown');
    },
  );

  it.each([
    ['chamber', ['chamber folk', 'chamber pop']],
    ['beats', ['barber beats', 'binaural beats']],
    [
      'acoustic',
      [
        'acoustic blues',
        'acoustic chicago blues',
        'acoustic rock',
        'acoustic texas blues',
        'neo-acoustic',
      ],
    ],
  ])(
    'expands the broad expression %p to its style family',
    (expression, genres) => {
      expect(resolveGenreExpression(expression)).toMatchObject({
        status: 'resolved',
        match: 'style_family',
      });
      expect(resolved(expression)).toEqual({ genres, region: undefined });
    },
  );

  it('keeps a style family too broad for one request ambiguous', () => {
    expect(resolved('dark')).toBe('ambiguous');
  });

  it('keeps style-family expansion literal', () => {
    expect(resolveGenreExpression('beats')).toMatchObject({
      status: 'resolved',
      match: 'style_family',
    });
    expect(resolved('chambers')).toBe('unknown');
  });

  it.each(['brazilian bass', 'UK garage', 'tragédie en musique'])(
    'keeps the canonical genre %p whose remainder is not a genre',
    (expression) => {
      expect(resolved(expression)).toEqual({
        genres: [expression.toLowerCase()],
        region: undefined,
      });
    },
  );

  it.each([
    'argentina',
    'brazilian',
    'argentine glorptrance',
    'de UK',
    'UK',
    'from the UK',
    'en UK',
    'in the UK',
    'británica',
    'británicas',
    'mexicanas',
  ])('never turns a region alone into a genre: %p', (expression) => {
    expect(resolved(expression)).toBe('unknown');
  });

  it.each(['definitely not a genre', 'glorptrance', '', '   '])(
    'keeps %p unknown',
    (expression) => {
      expect(resolved(expression)).toBe('unknown');
    },
  );
});
