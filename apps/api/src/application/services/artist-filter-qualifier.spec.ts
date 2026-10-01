import { Logger } from '@nestjs/common';
import type {
  ArtistTagCandidate,
  DiscoveryArtistIdentity,
  DiscoveryCatalogPort,
} from '@/domain/repositories/discovery-catalog.port';
import { BusinessRuleError } from '@/domain/errors/business-rule.error';
import type { ArtistSelectionFilters } from '@/domain/selection-filters/artist-selection-filters';
import { ArtistFilterQualifier } from './artist-filter-qualifier';

const REGION_ONLY: ArtistSelectionFilters = {
  region: 'argentina',
  femaleVocals: false,
};
const VOCALS_ONLY: ArtistSelectionFilters = {
  region: null,
  femaleVocals: true,
};
const REGION_AND_VOCALS: ArtistSelectionFilters = {
  region: 'argentina',
  femaleVocals: true,
};

function catalogWith(
  tags: (artist: DiscoveryArtistIdentity) => Promise<ArtistTagCandidate[]>,
) {
  const getTopTagsForArtist = jest.fn(tags);
  const catalog = { getTopTagsForArtist } as unknown as DiscoveryCatalogPort;
  return Object.assign(catalog, { lookups: getTopTagsForArtist });
}

function qualifier(
  catalog: DiscoveryCatalogPort,
  filters: ArtistSelectionFilters = REGION_ONLY,
) {
  return ArtistFilterQualifier.create(catalog, filters, new Logger('test'));
}

describe('ArtistFilterQualifier', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('qualifies only artists with a significant tag of the region', async () => {
    const catalog = catalogWith(({ name }) =>
      Promise.resolve(
        name === 'Soda Stereo'
          ? [{ name: 'Argentina', count: 60 }]
          : [{ name: 'argentina', count: 3 }],
      ),
    );
    const subject = qualifier(catalog);

    await expect(subject.qualifies({ name: 'Soda Stereo' })).resolves.toBe(
      true,
    );
    await expect(subject.qualifies({ name: 'Stray Tag' })).resolves.toBe(false);
  });

  it.each([
    [
      'a significant canonical tag',
      [{ name: 'female vocalists', count: 40 }],
      true,
    ],
    [
      'a differently cased tag',
      [{ name: ' Female Vocalists ', count: 40 }],
      true,
    ],
    [
      'the significance threshold',
      [{ name: 'female vocalists', count: 10 }],
      true,
    ],
    ['a low-weight stray tag', [{ name: 'female vocalists', count: 9 }], false],
    ['an unrelated tag', [{ name: 'female', count: 90 }], false],
    ['no vocal tag', [{ name: 'rock', count: 100 }], false],
  ])('evaluates female vocals with %s', async (_label, tags, expected) => {
    const subject = qualifier(
      catalogWith(() => Promise.resolve(tags)),
      VOCALS_ONLY,
    );

    await expect(subject.qualifies({ name: 'Artist' })).resolves.toBe(expected);
  });

  it('requires both region and female vocals from one tag lookup', async () => {
    const catalog = catalogWith(({ name }) =>
      Promise.resolve(
        {
          Both: [
            { name: 'argentina', count: 80 },
            { name: 'female vocalists', count: 60 },
          ],
          'Region Only': [{ name: 'argentina', count: 80 }],
          'Vocals Only': [{ name: 'female vocalists', count: 80 }],
        }[name] ?? [],
      ),
    );
    const subject = qualifier(catalog, REGION_AND_VOCALS);

    await expect(subject.qualifies({ name: 'Both' })).resolves.toBe(true);
    await expect(subject.qualifies({ name: 'Region Only' })).resolves.toBe(
      false,
    );
    await expect(subject.qualifies({ name: 'Vocals Only' })).resolves.toBe(
      false,
    );
    expect(catalog.lookups).toHaveBeenCalledTimes(3);
  });

  it('looks up each artist identity once per request', async () => {
    const catalog = catalogWith(() =>
      Promise.resolve([{ name: 'argentina', count: 100 }]),
    );
    const subject = qualifier(catalog, REGION_AND_VOCALS);

    await subject.prefetch([
      { name: 'Soda Stereo' },
      { name: 'soda stereo' },
      { name: 'Charly García', mbid: 'MBID-1' },
    ]);
    await subject.qualifies({ name: 'Charly Garcia', mbid: 'mbid-1' });
    await subject.qualifies({ name: 'Soda Stereo' });

    expect(catalog.lookups).toHaveBeenCalledTimes(2);
  });

  it('prefetches with bounded concurrency', async () => {
    let inFlight = 0;
    let peak = 0;
    const catalog = catalogWith(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return [];
    });

    await qualifier(catalog).prefetch(
      Array.from({ length: 10 }, (_, index) => ({ name: `Artist ${index}` })),
    );

    expect(catalog.lookups).toHaveBeenCalledTimes(10);
    expect(peak).toBeLessThanOrEqual(4);
  });

  it('treats a failed lookup as unknown evidence, never as a match', async () => {
    const catalog = catalogWith(({ name }) =>
      name === 'Broken'
        ? Promise.reject(new Error('Last.fm down'))
        : Promise.resolve([{ name: 'rock', count: 100 }]),
    );
    const subject = qualifier(catalog, VOCALS_ONLY);

    await expect(subject.qualifies({ name: 'Broken' })).resolves.toBe(false);
    await expect(subject.qualifies({ name: 'Elsewhere' })).resolves.toBe(false);
    expect(() => subject.assertEnforceable()).not.toThrow();
  });

  it('keeps the region error when only the region could not be checked', async () => {
    const catalog = catalogWith(() =>
      Promise.reject(new Error('Last.fm down')),
    );
    const subject = qualifier(catalog);

    await subject.prefetch([{ name: 'One' }, { name: 'Two' }]);

    expect(() => subject.assertEnforceable()).toThrow(
      expect.objectContaining({ code: 'REGION_LOOKUP_UNAVAILABLE' }),
    );
  });

  it.each([VOCALS_ONLY, REGION_AND_VOCALS])(
    'reports artist filters as unavailable when every lookup failed (%p)',
    async (filters) => {
      const catalog = catalogWith(() =>
        Promise.reject(new Error('Last.fm down')),
      );
      const subject = qualifier(catalog, filters);

      await subject.prefetch([{ name: 'One' }, { name: 'Two' }]);

      expect(() => subject.assertEnforceable()).toThrow(BusinessRuleError);
      expect(() => subject.assertEnforceable()).toThrow(
        expect.objectContaining({ code: 'ARTIST_FILTER_LOOKUP_UNAVAILABLE' }),
      );
    },
  );

  it('has nothing to enforce before any lookup', () => {
    expect(() =>
      qualifier(catalogWith(() => Promise.resolve([]))).assertEnforceable(),
    ).not.toThrow();
  });
});
