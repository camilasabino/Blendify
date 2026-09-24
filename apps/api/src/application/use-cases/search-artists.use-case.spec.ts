import { SearchArtistsUseCase } from './search-artists.use-case';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import { Artist } from '../../domain/artist/artist.entity';
import { ArtistId } from '../../domain/value-objects/artist-id.vo';
import type { DiscoveryCatalogPort } from '../../domain/repositories/discovery-catalog.port';
import type { CatalogProviderFactoryPort } from '../../domain/repositories/catalog-provider.port';

function makeArtist(id: string, name: string, imageUrl?: string): Artist {
  return Artist.create({
    id: ArtistId.create(id),
    name,
    imageUrl,
  });
}

describe('SearchArtistsUseCase', () => {
  const discovery: jest.Mocked<DiscoveryCatalogPort> = {
    isConfigured: jest.fn(),
    getSimilarArtists: jest.fn(),
    getSimilarTracks: jest.fn(),
    getTopArtistsForTag: jest.fn(),
    getTopTracksForTag: jest.fn(),
    getTopTracksForArtist: jest.fn(),
  };

  let searchArtists: jest.Mock;
  let forMarket: jest.Mock;
  let useCase: SearchArtistsUseCase;

  beforeEach(() => {
    jest.resetAllMocks();
    searchArtists = jest.fn();
    forMarket = jest.fn(() => ({ searchArtists }));
    const catalogs = { forMarket } as unknown as CatalogProviderFactoryPort;
    useCase = new SearchArtistsUseCase(catalogs, discovery);
  });

  it('searches Spotify artists and maps DTOs', async () => {
    searchArtists.mockResolvedValue([
      makeArtist('a1', 'Sade', 'https://img'),
      makeArtist('a2', 'Prince'),
    ]);

    await expect(
      useCase.execute({ query: 'Sade', limit: 5, market: 'AR' }),
    ).resolves.toEqual([
      { id: 'a1', name: 'Sade', imageUrl: 'https://img' },
      { id: 'a2', name: 'Prince', imageUrl: null },
    ]);
    expect(searchArtists).toHaveBeenCalledWith('Sade', 5);
    expect(forMarket).toHaveBeenCalledWith('AR');
  });

  it('resolves names to unique best Spotify matches', async () => {
    searchArtists
      .mockResolvedValueOnce([makeArtist('a1', 'Sade')])
      .mockResolvedValueOnce([makeArtist('a1', 'Sade')])
      .mockResolvedValueOnce([makeArtist('a2', 'Prince')]);

    await expect(
      useCase.resolveNames([' Sade ', '', 'Sade', 'Prince'], 'BR'),
    ).resolves.toEqual([
      { id: 'a1', name: 'Sade', imageUrl: null },
      { id: 'a2', name: 'Prince', imageUrl: null },
    ]);
    expect(forMarket).toHaveBeenCalledWith('BR');
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

  it('rethrows BusinessRuleError from Last.fm unchanged', async () => {
    discovery.isConfigured.mockReturnValue(true);
    discovery.getSimilarArtists.mockRejectedValue(
      new BusinessRuleError('quota', 'SPOTIFY_QUOTA_EXCEEDED'),
    );

    await expect(
      useCase.exploreSimilar({ seedName: 'Cher' }),
    ).rejects.toMatchObject({ code: 'SPOTIFY_QUOTA_EXCEEDED' });
  });
});
