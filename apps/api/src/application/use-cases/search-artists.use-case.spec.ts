import { SearchArtistsUseCase } from './search-artists.use-case';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import type { DiscoveryCatalogPort } from '../../domain/repositories/discovery-catalog.port';
import type { MusicProviderFactoryPort } from '../../domain/repositories/music-provider.factory.port';

describe('SearchArtistsUseCase.exploreSimilar', () => {
  const discovery: jest.Mocked<DiscoveryCatalogPort> = {
    isConfigured: jest.fn(),
    getSimilarArtists: jest.fn(),
    getSimilarTracks: jest.fn(),
    getTopArtistsForTag: jest.fn(),
    getTopTracksForTag: jest.fn(),
    getTopTracksForArtist: jest.fn(),
  };

  const providers = {} as MusicProviderFactoryPort;
  const useCase = new SearchArtistsUseCase(providers, discovery);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns empty when the seed name is blank', async () => {
    discovery.isConfigured.mockReturnValue(true);
    await expect(useCase.exploreSimilar({ seedName: '  ' })).resolves.toEqual({
      artists: [],
      hasMore: false,
      source: 'lastfm',
    });
  });

  it('fails when Last.fm is not configured', async () => {
    discovery.isConfigured.mockReturnValue(false);
    await expect(
      useCase.exploreSimilar({ seedName: 'Cher' }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('pages similar artists and excludes seed aliases', async () => {
    discovery.isConfigured.mockReturnValue(true);
    discovery.getSimilarArtists.mockResolvedValue([
      { name: 'Yusuf', match: 1 },
      { name: 'Cat Stevens', match: 0.9 },
      { name: 'Paul Simon', match: 0.8 },
      { name: 'James Taylor', match: 0.7 },
      { name: 'Jim Croce', match: 0.6 },
    ]);

    const page = await useCase.exploreSimilar({
      seedName: 'Yusuf / Cat Stevens',
      limit: 2,
      offset: 0,
    });

    expect(page.artists.map((a) => a.name)).toEqual([
      'Paul Simon',
      'James Taylor',
    ]);
    expect(page.hasMore).toBe(true);
    expect(page.source).toBe('lastfm');
  });

  it('wraps Last.fm failures as a business rule error', async () => {
    discovery.isConfigured.mockReturnValue(true);
    discovery.getSimilarArtists.mockRejectedValue(new Error('down'));

    await expect(
      useCase.exploreSimilar({ seedName: 'Cher' }),
    ).rejects.toMatchObject({ code: 'LASTFM_SIMILAR_FAILED' });
  });
});
