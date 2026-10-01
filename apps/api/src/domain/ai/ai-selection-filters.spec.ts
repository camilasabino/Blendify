import type { AiIntent } from './ai-intent';
import {
  aiSelectionFilters,
  resolveAiRegion,
  withCanonicalRegion,
} from './ai-selection-filters';

function intent(overrides: Partial<AiIntent> = {}): AiIntent {
  return {
    kind: 'genre_mix',
    artists: [],
    genres: [],
    seedTracks: [],
    filters: { region: null },
    targetTrackCount: null,
    targetDurationMinutes: null,
    mood: null,
    popularity: null,
    orderMode: null,
    excludeArtists: [],
    excludeTracks: [],
    unsupportedConstraints: [],
    ...overrides,
  };
}

function regionText(region: string): AiIntent['filters'] {
  return { region };
}

describe('resolveAiRegion', () => {
  it.each([
    ['rock argentino', 'argentina'],
    ['Brazilian pop', 'brazilian'],
    ['baladas latino-americanas', 'latin'],
    ['rock britânico', 'british'],
    ['rancheras mexicanas', 'mexico'],
    ['rock argentinos', 'argentina'],
    ['pop brasileiros', 'brazilian'],
    ['rock británicos', 'british'],
  ])('reads the region of the regional genre %p as %p', (genre, region) => {
    expect(resolveAiRegion(intent({ genres: [genre] }))).toEqual({
      region,
      unknown: null,
      conflicting: [],
    });
  });

  it('applies one shared regional modifier to every genre', () => {
    expect(
      resolveAiRegion(
        intent({ genres: ['argentine rock', 'pop argentino', 'jazz'] }),
      ).region,
    ).toBe('argentina');
  });

  it.each([
    [['british pop', 'british rock', 'british r&b']],
    [['UK pop', 'UK rock', 'UK R&B']],
    [['pop', 'rock', 'r&b de uk']],
    [['pop from the UK', 'rock', 'r&b']],
    [['pop en UK', 'rock en Reino Unido', 'r&b in the UK']],
  ])(
    'reads adjectival and prepositional UK forms of %p as british',
    (genres) => {
      expect(resolveAiRegion(intent({ genres })).region).toBe('british');
    },
  );

  it.each([
    ['Argentina', 'argentina'],
    ['argentino', 'argentina'],
    ['brasileras', 'brazilian'],
    ['Brasil', 'brazilian'],
    ['the UK', 'british'],
    ['Reino Unido', 'british'],
    ['británica', 'british'],
    ['de Brasil', 'brazilian'],
  ])('canonicalizes the region filter text %p as %p', (text, region) => {
    expect(
      resolveAiRegion(
        intent({
          kind: 'discover_artist',
          artists: ['Radiohead'],
          filters: regionText(text),
        }),
      ),
    ).toEqual({ region, unknown: null, conflicting: [] });
  });

  it('keeps a filter region that matches the regional genre', () => {
    expect(
      resolveAiRegion(
        intent({
          genres: ['rock argentino'],
          filters: regionText('Argentina'),
        }),
      ),
    ).toEqual({ region: 'argentina', unknown: null, conflicting: [] });
  });

  it('reports regional sources that ask for different regions', () => {
    expect(
      resolveAiRegion(
        intent({ genres: ['rock argentino', 'jazz', 'pop brasileiro'] }),
      ),
    ).toEqual({
      region: null,
      unknown: null,
      conflicting: ['rock argentino', 'pop brasileiro'],
    });
    expect(
      resolveAiRegion(
        intent({ genres: ['rock de UK'], filters: regionText('Brasil') }),
      ).conflicting,
    ).toEqual(['Brasil', 'rock de UK']);
  });

  it('reports a region filter outside the curated regions as unknown', () => {
    expect(
      resolveAiRegion(
        intent({
          kind: 'discover_artist',
          artists: ['Radiohead'],
          filters: regionText('japonés'),
        }),
      ),
    ).toEqual({ region: null, unknown: 'japonés', conflicting: [] });
  });

  it('has no region when neither the filter nor the genres name one', () => {
    expect(aiSelectionFilters(intent({ genres: ['rock'] }))).toEqual({
      region: null,
    });
  });
});

describe('withCanonicalRegion', () => {
  it('moves a regional genre modifier into the canonical region filter', () => {
    expect(
      withCanonicalRegion(intent({ genres: ['rock argentino', 'jazz'] })),
    ).toMatchObject({
      genres: ['rock', 'jazz'],
      filters: { region: 'argentina' },
    });
  });

  it('stores the canonical region for a user-language filter', () => {
    expect(
      withCanonicalRegion(
        intent({
          kind: 'discover_track',
          seedTracks: [{ title: 'Creep', artist: null }],
          filters: regionText('brasileras'),
        }),
      ).filters,
    ).toEqual({ region: 'brazilian' });
  });

  it('is idempotent once the region is canonical', () => {
    const canonical = withCanonicalRegion(
      intent({ genres: ['UK pop', 'rock'] }),
    );

    expect(canonical).toMatchObject({
      genres: ['pop', 'rock'],
      filters: { region: 'british' },
    });
    expect(withCanonicalRegion(canonical)).toEqual(canonical);
  });

  it.each([
    intent({ genres: ['rock argentino', 'pop brasileiro'] }),
    intent({ genres: ['rock argentino'], filters: regionText('Brasil') }),
    intent({ kind: 'discover_artist', filters: regionText('japonés') }),
  ])('leaves conflicting or unknown regions for clarification', (input) => {
    expect(withCanonicalRegion(input)).toEqual(input);
  });
});
