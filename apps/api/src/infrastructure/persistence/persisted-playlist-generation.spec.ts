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

const INACTIVE_FILTERS = {
  region: null,
  femaleVocals: false,
  releaseRange: null,
  excludeLive: false,
};

describe('parsePersistedGeneration', () => {
  it('reads a legacy top-level Genre Mix region as filters.region', () => {
    const generation = parsePersistedGeneration({
      ...genreMix,
      region: 'argentina',
    });

    expect(generation).toEqual({
      ...genreMix,
      filters: { ...INACTIVE_FILTERS, region: 'argentina' },
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
      filters: { ...INACTIVE_FILTERS, region: 'brazilian' },
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
    ).toEqual({
      ...genreMix,
      filters: { ...INACTIVE_FILTERS, region: 'mexico' },
    });
  });

  it('reads region-only recipes with the new filters inactive', () => {
    expect(
      parsePersistedGeneration({
        kind: 'discover_artist',
        version: 1,
        popularity: 'balanced',
        orderMode: 'random',
        targetTrackCount: 30,
        seed: { id: 'artist-1', name: 'Soda Stereo' },
        filters: { region: 'argentina' },
      }),
    ).toMatchObject({ filters: { ...INACTIVE_FILTERS, region: 'argentina' } });
  });

  it('reads legacy artist mix recipes with inactive filters', () => {
    expect(
      parsePersistedGeneration({
        kind: 'artist_mix',
        version: 1,
        popularity: 'balanced',
        orderMode: 'random',
        tracksPerSeed: 10,
        seeds: [{ id: 'artist-1', name: 'Soda Stereo' }],
      }),
    ).toMatchObject({ filters: INACTIVE_FILTERS });
  });

  it('round-trips every active filter', () => {
    const filters = {
      region: 'argentina',
      femaleVocals: true,
      releaseRange: { fromYear: 1990, toYear: 1999 },
      excludeLive: true,
    };

    expect(parsePersistedGeneration({ ...genreMix, filters })).toEqual({
      ...genreMix,
      filters,
    });
  });
});
