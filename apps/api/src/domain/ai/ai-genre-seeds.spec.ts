import { MAX_GENRES } from '@/domain/constants';
import { aiGenreKey, resolveAiGenreSeeds } from './ai-genre-seeds';

describe('resolveAiGenreSeeds', () => {
  it('resolves semantic genre expressions to canonical MusicBrainz seeds', () => {
    expect(resolveAiGenreSeeds(['alternative rock', 'chamber'])).toEqual({
      genres: [
        { id: 'alternative rock', name: 'Alternative Rock' },
        { id: 'chamber folk', name: 'Chamber Folk' },
        { id: 'chamber pop', name: 'Chamber Pop' },
      ],
      region: null,
      unknown: [],
      ambiguous: [],
      conflictingRegions: [],
    });
  });

  it.each([
    ['rock argentino', 'rock', 'argentina'],
    ['Brazilian pop', 'pop', 'brazilian'],
    ['baladas latino-americanas', 'ballad', 'latin'],
    ['rock britânico', 'rock', 'british'],
  ])('resolves %p to genre %p and region %p', (expression, genre, region) => {
    expect(resolveAiGenreSeeds([expression])).toMatchObject({
      genres: [{ id: genre }],
      region,
    });
  });

  it.each([
    ['ranchera mexicana', 'ranchera', 'mexico'],
    ['rancheras mexicanas', 'ranchera', 'mexico'],
    ['rock argentinos', 'rock', 'argentina'],
    ['pop brasileiros', 'pop', 'brazilian'],
    ['rock británicos', 'rock', 'british'],
  ])(
    'resolves the inflected %p to genre %p and region %p',
    (expression, genre, region) => {
      expect(resolveAiGenreSeeds([expression])).toMatchObject({
        genres: [{ id: genre }],
        region,
        unknown: [],
        ambiguous: [],
        conflictingRegions: [],
      });
    },
  );

  it('resolves plural genre names to the same canonical seed', () => {
    expect(
      resolveAiGenreSeeds(['corridos tumbados', 'corridos tumbado']).genres,
    ).toEqual([{ id: 'corrido tumbado', name: 'Corrido Tumbado' }]);
  });

  it('leaves approximate spellings and ambiguous plurals to clarification', () => {
    expect(
      resolveAiGenreSeeds(['corrdo tumbado', 'alternatve rock', 'kasekòs']),
    ).toEqual({
      genres: [],
      region: null,
      unknown: ['corrdo tumbado', 'alternatve rock'],
      ambiguous: ['kasekòs'],
      conflictingRegions: [],
    });
  });

  it('applies one shared region to every genre of the request', () => {
    expect(
      resolveAiGenreSeeds(['argentine rock', 'pop argentino', 'jazz']),
    ).toMatchObject({
      genres: [{ id: 'rock' }, { id: 'pop' }, { id: 'jazz' }],
      region: 'argentina',
      conflictingRegions: [],
    });
  });

  it.each([
    [['british pop', 'british rock', 'british r&b']],
    [['UK pop', 'UK rock', 'UK R&B']],
    [['pop', 'rock', 'r&b de uk']],
    [['pop from the UK', 'rock', 'r&b']],
    [['pop en UK', 'rock en Reino Unido', 'r&b in the UK']],
  ])(
    'resolves adjectival and prepositional UK forms of %p to the same British seeds',
    (expressions) => {
      expect(resolveAiGenreSeeds(expressions)).toEqual({
        genres: [
          { id: 'pop', name: 'Pop' },
          { id: 'rock', name: 'Rock' },
          { id: 'r&b', name: 'R&B' },
        ],
        region: 'british',
        unknown: [],
        ambiguous: [],
        conflictingRegions: [],
      });
    },
  );

  it('reports regional expressions that ask for different regions', () => {
    expect(
      resolveAiGenreSeeds(['rock argentino', 'jazz', 'pop brasileiro']),
    ).toMatchObject({
      region: null,
      conflictingRegions: ['rock argentino', 'pop brasileiro'],
    });
    expect(resolveAiGenreSeeds(['rock de UK', 'pop do Brasil'])).toMatchObject({
      region: null,
      conflictingRegions: ['rock de UK', 'pop do Brasil'],
    });
  });

  it('removes duplicate canonical genres reached by different expressions', () => {
    expect(
      resolveAiGenreSeeds(['rock alternativo', 'Alternative Rock']).genres,
    ).toEqual([{ id: 'alternative rock', name: 'Alternative Rock' }]);
  });

  it('separates unknown and ambiguous expressions from executable ones', () => {
    expect(resolveAiGenreSeeds(['rock', 'dark', 'zorblax wave'])).toEqual({
      genres: [{ id: 'rock', name: 'Rock' }],
      region: null,
      unknown: ['zorblax wave'],
      ambiguous: ['dark'],
      conflictingRegions: [],
    });
  });

  it('never accepts a region alone', () => {
    expect(resolveAiGenreSeeds(['argentina', 'de UK'])).toEqual({
      genres: [],
      region: null,
      unknown: ['argentina', 'de UK'],
      ambiguous: [],
      conflictingRegions: [],
    });
  });

  it('reports an expansion as ambiguous when it would exceed MAX_GENRES in total', () => {
    const exact = ['rock', 'pop', 'jazz', 'blues'];

    const seeds = resolveAiGenreSeeds([...exact, 'chamber']);

    expect(exact.length + 2).toBeGreaterThan(MAX_GENRES);
    expect(seeds.genres.map((genre) => genre.id)).toEqual(exact);
    expect(seeds.ambiguous).toEqual(['chamber']);
    expect(seeds.unknown).toEqual([]);
  });
});

describe('aiGenreKey', () => {
  it('compares resolvable genres by canonical genre and region', () => {
    expect(aiGenreKey('Rock Alternativo')).toBe(aiGenreKey('alternative-rock'));
    expect(aiGenreKey('brazilian popular music')).toBe(aiGenreKey('MPB'));
    expect(aiGenreKey('rock argentino')).toBe(aiGenreKey('Argentine Rock'));
    expect(aiGenreKey('rock argentino')).not.toBe(aiGenreKey('rock'));
    expect(aiGenreKey('rock argentino')).not.toBe(aiGenreKey('British rock'));
    expect(aiGenreKey('rock de UK')).toBe(aiGenreKey('British rock'));
    expect(aiGenreKey('indie rock')).not.toBe(aiGenreKey('rock'));
    expect(aiGenreKey('rancheras mexicanas')).toBe(
      aiGenreKey('ranchera mexicana'),
    );
    expect(aiGenreKey('corridos tumbados')).toBe(aiGenreKey('Corrido Tumbado'));
  });

  it('falls back to the normalized name for unresolved expressions', () => {
    expect(aiGenreKey('Zorblax Wave')).toBe(aiGenreKey('zorblax wave'));
    expect(aiGenreKey('zorblax wave')).not.toBe(aiGenreKey('rock'));
  });
});
