import type { ConfigService } from '@nestjs/config';
import type { SpotifyTokenService } from '../auth/spotify-token.service';
import type { SpotifyAppTokenProvider } from './spotify-app-token.provider';
import { SpotifyMusicProvider } from './spotify-music.provider';

const mockRaw = jest.fn();
const mockUserAccessToken = jest.fn();

jest.mock('./spotify-api.client', () => ({
  SpotifyApiClient: jest.fn().mockImplementation(() => ({
    raw: mockRaw,
    accessToken: mockUserAccessToken,
    isStatus: () => false,
    toSpotifyError: (_operation: string, error: unknown) => error,
  })),
}));

function createProvider(defaultMarket?: string) {
  const appTokens = {
    getAccessToken: jest.fn(() => Promise.resolve('app-token')),
    invalidate: jest.fn(),
  };
  const config = {
    get: (key: string) =>
      key === 'SPOTIFY_CATALOG_MARKET' ? defaultMarket : undefined,
  } as unknown as ConfigService;
  const provider = new SpotifyMusicProvider(
    {} as SpotifyTokenService,
    appTokens as unknown as SpotifyAppTokenProvider,
    config,
  );
  return { provider, appTokens };
}

function lastParams(): Record<string, unknown> | undefined {
  const config = mockRaw.mock.calls.at(-1)?.[1] as
    { params?: Record<string, unknown> } | undefined;
  return config?.params;
}

describe('SpotifyMusicProvider', () => {
  beforeEach(() => {
    mockRaw.mockReset();
    mockRaw.mockResolvedValue({ data: { artists: { items: [] } } });
    mockUserAccessToken.mockReset();
  });

  it('uses the requested market with the application token', async () => {
    const { provider, appTokens } = createProvider('US');

    await provider.forMarket('ar').searchArtists('Sade');

    expect(appTokens.getAccessToken).toHaveBeenCalled();
    expect(mockRaw).toHaveBeenCalledWith('app-token', expect.anything());
    expect(lastParams()).toMatchObject({ market: 'AR' });
    expect(mockUserAccessToken).not.toHaveBeenCalled();
  });

  it('falls back to the configured market', async () => {
    const { provider } = createProvider('us');

    await provider.forMarket(undefined).searchArtists('Sade');

    expect(lastParams()).toMatchObject({ market: 'US' });
  });

  it('fails at construction when no market is configured', () => {
    expect(() => createProvider()).toThrow(
      'SPOTIFY_CATALOG_MARKET is required',
    );
  });

  it('keeps user-bound operations off the catalog surface', () => {
    const { provider } = createProvider('AR');

    const userProvider = provider.forUser('user-1');

    expect(userProvider).not.toHaveProperty('searchArtists');
    expect(typeof userProvider.createPlaylist).toBe('function');
  });
});
