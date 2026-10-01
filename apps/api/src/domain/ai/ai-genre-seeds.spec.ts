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
      unknown: [],
      ambiguous: [],
    });
  });

  it.each([
    ['rock argentino', 'rock'],
    ['Brazilian pop', 'pop'],
    ['baladas latino-americanas', 'ballad'],
    ['rock britânico', 'rock'],
  ])('resolves the regional %p to genre %p', (expression, genre) => {
    expect(resolveAiGenreSeeds([expression])).toMatchObject({
      genres: [{ id: genre }],
    });
  });

  it.each([
    ['ranchera mexicana', 'ranchera'],
    ['rancheras mexicanas', 'ranchera'],
    ['rock argentinos', 'rock'],
    ['pop brasileiros', 'pop'],
    ['rock británicos', 'rock'],
  ])('resolves the inflected regional %p to genre %p', (expression, genre) => {
    expect(resolveAiGenreSeeds([expression])).toMatchObject({
      genres: [{ id: genre }],
      unknown: [],
      ambiguous: [],
    });
  });

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
      unknown: ['corrdo tumbado', 'alternatve rock'],
      ambiguous: ['kasekòs'],
    });
  });

  it.each([
    [['british pop', 'british rock', 'british r&b']],
    [['UK pop', 'UK rock', 'UK R&B']],
    [['pop', 'rock', 'r&b de uk']],
    [['pop from the UK', 'rock', 'r&b']],
    [['pop en UK', 'rock en Reino Unido', 'r&b in the UK']],
  ])(
    'resolves adjectival and prepositional UK forms of %p to the same seeds',
    (expressions) => {
      expect(resolveAiGenreSeeds(expressions)).toEqual({
        genres: [
          { id: 'pop', name: 'Pop' },
          { id: 'rock', name: 'Rock' },
          { id: 'r&b', name: 'R&B' },
        ],
        unknown: [],
        ambiguous: [],
      });
    },
  );

  it('removes duplicate canonical genres reached by different expressions', () => {
    expect(
      resolveAiGenreSeeds(['rock alternativo', 'Alternative Rock']).genres,
    ).toEqual([{ id: 'alternative rock', name: 'Alternative Rock' }]);
  });

  it('separates unknown and ambiguous expressions from executable ones', () => {
    expect(resolveAiGenreSeeds(['rock', 'dark', 'zorblax wave'])).toEqual({
      genres: [{ id: 'rock', name: 'Rock' }],
      unknown: ['zorblax wave'],
      ambiguous: ['dark'],
    });
  });

  it('never accepts a region alone', () => {
    expect(resolveAiGenreSeeds(['argentina', 'de UK'])).toEqual({
      genres: [],
      unknown: ['argentina', 'de UK'],
      ambiguous: [],
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
