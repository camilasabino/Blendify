import { SpotifyCatalogClient } from './spotify-catalog.client';
import type { SpotifyApiClient } from './spotify-api.client';

describe('SpotifyCatalogClient.resolveTrack', () => {
  it('attributes collaborations to the selected Spotify artist id', async () => {
    const api = {
      accessToken: jest.fn().mockResolvedValue('token'),
      request: jest.fn().mockResolvedValue({
        tracks: {
          items: [
            {
              id: 'track-1',
              name: 'Mercy',
              duration_ms: 200_000,
              popularity: 70,
              uri: 'spotify:track:track-1',
              artists: [
                { id: 'guest-id', name: 'Guest' },
                { id: 'duffy-id', name: 'Duffy' },
              ],
            },
          ],
        },
      }),
    } as unknown as SpotifyApiClient;
    const client = new SpotifyCatalogClient('user-1', api);

    const track = await client.resolveTrack('Duffy', 'Mercy', {
      artistId: 'duffy-id',
    });

    expect(track?.artistId.getValue()).toBe('duffy-id');
    expect(track?.artistName).toBe('Duffy');
  });

  it('rejects homonyms when the selected artist id is absent', async () => {
    const api = {
      accessToken: jest.fn().mockResolvedValue('token'),
      request: jest.fn().mockResolvedValue({
        tracks: {
          items: [
            {
              id: 'track-1',
              name: 'Mercy',
              duration_ms: 200_000,
              uri: 'spotify:track:track-1',
              artists: [{ id: 'stephen-id', name: 'Stephen Duffy' }],
            },
          ],
        },
      }),
    } as unknown as SpotifyApiClient;
    const client = new SpotifyCatalogClient('user-1', api);

    await expect(
      client.resolveTrack('Duffy', 'Mercy', { artistId: 'duffy-id' }),
    ).resolves.toBeNull();
  });
});
