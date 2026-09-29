import { MAX_GENRES } from '@/domain/constants';
import { aiGenreKey, resolveCuratedGenreSeeds } from './ai-genre-seeds';

describe('resolveCuratedGenreSeeds', () => {
  it('resolves semantic genre expressions to canonical curated seeds', () => {
    expect(
      resolveCuratedGenreSeeds(['argentine rock', 'acoustic guitar']),
    ).toEqual({
      genres: [
        { id: 'argentine-rock', name: 'Argentine Rock' },
        { id: 'acoustic-guitar-cover', name: 'Acoustic Guitar Cover' },
        {
          id: 'instrumental-acoustic-guitar',
          name: 'Instrumental Acoustic Guitar',
        },
      ],
      unknown: [],
      ambiguous: [],
    });
  });

  it('removes duplicate canonical genres reached by different expressions', () => {
    expect(
      resolveCuratedGenreSeeds([
        'instrumental acoustic guitar',
        'acoustic guitar',
      ]).genres.map((genre) => genre.id),
    ).toEqual(['instrumental-acoustic-guitar', 'acoustic-guitar-cover']);
  });

  it('separates unknown and ambiguous expressions from executable ones', () => {
    expect(
      resolveCuratedGenreSeeds(['rock', 'instrumental', 'zorblax wave']),
    ).toEqual({
      genres: [{ id: 'rock', name: 'Rock' }],
      unknown: ['zorblax wave'],
      ambiguous: ['instrumental'],
    });
  });

  it('resolves instrumental alone to its curated representative genres', () => {
    expect(resolveCuratedGenreSeeds(['instrumental'])).toEqual({
      genres: [
        { id: 'instrumental-hip-hop', name: 'Instrumental Hip Hop' },
        { id: 'instrumental-rock', name: 'Instrumental Rock' },
        { id: 'instrumental-funk', name: 'Instrumental Funk' },
        { id: 'instrumental-soul', name: 'Instrumental Soul' },
        {
          id: 'instrumental-acoustic-guitar',
          name: 'Instrumental Acoustic Guitar',
        },
      ],
      unknown: [],
      ambiguous: [],
    });
  });

  it('resolves an English form and its local genre name to one seed', () => {
    expect(
      resolveCuratedGenreSeeds(['argentine pop', 'pop argentino']),
    ).toEqual({
      genres: [{ id: 'pop-argentino', name: 'Pop Argentino' }],
      unknown: [],
      ambiguous: [],
    });
  });

  it('resolves local-language genre expressions to their English-named catalog seeds', () => {
    expect(
      resolveCuratedGenreSeeds(['rock argentino', 'jazz brasileiro']),
    ).toEqual({
      genres: [
        { id: 'argentine-rock', name: 'Argentine Rock' },
        { id: 'brazilian-jazz', name: 'Brazilian Jazz' },
      ],
      unknown: [],
      ambiguous: [],
    });
  });

  it('resolves a local-language form and its English catalog name to one seed', () => {
    expect(
      resolveCuratedGenreSeeds(['argentine rock', 'rock argentino']),
    ).toEqual({
      genres: [{ id: 'argentine-rock', name: 'Argentine Rock' }],
      unknown: [],
      ambiguous: [],
    });
  });

  it('never accepts custom genre ids through the AI path', () => {
    expect(resolveCuratedGenreSeeds(['custom:acid%20jazz'])).toEqual({
      genres: [],
      unknown: ['custom:acid%20jazz'],
      ambiguous: [],
    });
  });

  it('reports an expansion as ambiguous when it would exceed MAX_GENRES in total', () => {
    const exact = ['rock', 'pop', 'jazz', 'blues'];

    const seeds = resolveCuratedGenreSeeds([...exact, 'acoustic guitar']);

    expect(exact.length + 2).toBeGreaterThan(MAX_GENRES);
    expect(seeds.genres.map((genre) => genre.id)).toEqual(exact);
    expect(seeds.ambiguous).toEqual(['acoustic guitar']);
    expect(seeds.unknown).toEqual([]);
  });
});

describe('aiGenreKey', () => {
  it('compares resolvable genres by their canonical curated ids', () => {
    expect(aiGenreKey('Argentine Rock')).toBe(aiGenreKey('argentine-rock'));
    expect(aiGenreKey('Acoustic Guitar')).toBe(aiGenreKey('acoustic guitar'));
    expect(aiGenreKey('indie rock')).not.toBe(aiGenreKey('rock'));
    expect(aiGenreKey('Argentine pop')).toBe(aiGenreKey('pop argentino'));
    expect(aiGenreKey('brazilian popular music')).toBe(aiGenreKey('MPB'));
    expect(aiGenreKey('rock argentino')).toBe(aiGenreKey('Argentine Rock'));
    expect(aiGenreKey('jazz brasileiro')).toBe(aiGenreKey('brazilian jazz'));
    expect(aiGenreKey('instrumental')).not.toBe(
      aiGenreKey('instrumental rock'),
    );
  });

  it('falls back to the normalized name for unresolved expressions', () => {
    expect(aiGenreKey('Zorblax Wave')).toBe(aiGenreKey('zorblax wave'));
    expect(aiGenreKey('zorblax wave')).not.toBe(aiGenreKey('rock'));
  });
});
