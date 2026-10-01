import { Logger } from '@nestjs/common';
import type {
  ArtistTagCandidate,
  DiscoveryArtistIdentity,
  DiscoveryCatalogPort,
} from '@/domain/repositories/discovery-catalog.port';
import { BusinessRuleError } from '@/domain/errors/business-rule.error';
import { RegionArtistQualifier } from './region-artist-qualifier';

function catalogWith(
  tags: (artist: DiscoveryArtistIdentity) => Promise<ArtistTagCandidate[]>,
) {
  const getTopTagsForArtist = jest.fn(tags);
  const catalog = { getTopTagsForArtist } as unknown as DiscoveryCatalogPort;
  return Object.assign(catalog, { lookups: getTopTagsForArtist });
}

function qualifier(catalog: DiscoveryCatalogPort) {
  return new RegionArtistQualifier(catalog, 'argentina', new Logger('test'));
}

describe('RegionArtistQualifier', () => {
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

  it('looks up each artist identity once per request', async () => {
    const catalog = catalogWith(() =>
      Promise.resolve([{ name: 'argentina', count: 100 }]),
    );
    const subject = qualifier(catalog);

    await subject.prefetch([
      { name: 'Soda Stereo' },
      { name: 'soda stereo' },
      { name: 'Charly García', mbid: 'MBID-1' },
    ]);
    await subject.qualifies({ name: 'Charly Garcia', mbid: 'mbid-1' });
    await subject.qualifies({ name: 'Soda Stereo' });

    expect(catalog.lookups).toHaveBeenCalledTimes(2);
  });

  it('treats a failed lookup as unknown evidence, never as a match', async () => {
    const catalog = catalogWith(({ name }) =>
      name === 'Broken'
        ? Promise.reject(new Error('Last.fm down'))
        : Promise.resolve([{ name: 'rock', count: 100 }]),
    );
    const subject = qualifier(catalog);

    await expect(subject.qualifies({ name: 'Broken' })).resolves.toBe(false);
    await expect(subject.qualifies({ name: 'Elsewhere' })).resolves.toBe(false);
    expect(() => subject.assertEnforceable()).not.toThrow();
  });

  it('reports the region as unavailable when every lookup failed', async () => {
    const catalog = catalogWith(() =>
      Promise.reject(new Error('Last.fm down')),
    );
    const subject = qualifier(catalog);

    await subject.prefetch([{ name: 'One' }, { name: 'Two' }]);

    expect(() => subject.assertEnforceable()).toThrow(BusinessRuleError);
    expect(() => subject.assertEnforceable()).toThrow(
      'Could not check which results belong to the selected region right now.',
    );
  });

  it('has nothing to enforce before any lookup', () => {
    expect(() =>
      qualifier(catalogWith(() => Promise.resolve([]))).assertEnforceable(),
    ).not.toThrow();
  });
});
