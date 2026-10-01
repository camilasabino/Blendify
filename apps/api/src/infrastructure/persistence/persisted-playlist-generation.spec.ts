import { ZodError } from 'zod';
import { parsePersistedGeneration } from './persisted-playlist-generation';

const genreMix = {
  kind: 'genre_mix',
  version: 1,
  popularity: 'balanced',
  orderMode: 'random',
  tracksPerSeed: 10,
  seeds: [{ id: 'rock', name: 'Rock' }],
};

describe('parsePersistedGeneration', () => {
  it('reads a legacy top-level Genre Mix region as filters.region', () => {
    const generation = parsePersistedGeneration({
      ...genreMix,
      region: 'argentina',
    });

    expect(generation).toEqual({
      ...genreMix,
      filters: { region: 'argentina' },
    });
    expect(generation).not.toHaveProperty('region');
  });

  it('accepts a legacy region that matches filters.region', () => {
    const generation = parsePersistedGeneration({
      ...genreMix,
      region: 'brazilian',
      filters: { region: 'brazilian' },
    });

    expect(generation).toEqual({
      ...genreMix,
      filters: { region: 'brazilian' },
    });
  });

  it.each([{ region: 'brazilian' }, { region: null }, {}])(
    'rejects a legacy region that conflicts with filters %j',
    (filters) => {
      expect(() =>
        parsePersistedGeneration({ ...genreMix, region: 'argentina', filters }),
      ).toThrow(ZodError);
    },
  );

  it('rejects a legacy region outside the canonical regions', () => {
    expect(() =>
      parsePersistedGeneration({ ...genreMix, region: 'atlantis' }),
    ).toThrow(ZodError);
  });

  it('reads canonical recipes unchanged', () => {
    expect(
      parsePersistedGeneration({
        ...genreMix,
        filters: { region: 'mexico' },
      }),
    ).toEqual({ ...genreMix, filters: { region: 'mexico' } });
  });
});
