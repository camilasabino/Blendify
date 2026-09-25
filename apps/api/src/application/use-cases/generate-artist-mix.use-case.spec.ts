import { PopularityMode } from '@blendify/contracts';
import { Artist } from '../../domain/artist/artist.entity';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import { GeneratedPlaylist } from '../../domain/playlist/generated-playlist';
import type { CatalogProviderPort } from '../../domain/repositories/catalog-provider.port';
import type { DiscoveryCatalogPort } from '../../domain/repositories/discovery-catalog.port';
import { Track } from '../../domain/track/track.entity';
import { ArtistId } from '../../domain/value-objects/artist-id.vo';
import { TrackId } from '../../domain/value-objects/track-id.vo';
import { GenerateArtistMixUseCase } from './generate-artist-mix.use-case';

function makeTrack(
  extra: Partial<Parameters<typeof Track.create>[0]> = {},
): Track {
  return Track.create({
    id: TrackId.create('track-1'),
    name: 'Smooth Operator',
    artistId: ArtistId.create('artist-1'),
    artistName: 'Sade',
    durationMs: 250_000,
    popularity: 80,
    uri: 'spotify:track:track-1',
    ...extra,
  });
}

function setup() {
  const artist = Artist.create({
    id: ArtistId.create('artist-1'),
    name: 'Sade',
    imageUrl: 'https://images.example/sade.jpg',
  });
  const searchTracks = jest.fn().mockResolvedValue([makeTrack()]);
  const catalog = { searchTracks } as unknown as CatalogProviderPort;
  const forMarket = jest.fn().mockReturnValue(catalog);
  const assertAvailable = jest.fn();

  const useCase = new GenerateArtistMixUseCase(
    { forMarket },
    { assertAvailable },
    {
      isConfigured: () => false,
    } as unknown as DiscoveryCatalogPort,
  );

  return { artist, assertAvailable, forMarket, searchTracks, useCase };
}

describe('GenerateArtistMixUseCase', () => {
  it('checks quota and returns a destination-agnostic generated playlist', async () => {
    const context = setup();

    const result = await context.useCase.execute({
      market: 'AR',
      kind: 'artist_mix',
      artistIds: ['artist-1'],
      artists: [
        {
          id: context.artist.id.getValue(),
          name: context.artist.name,
          imageUrl: context.artist.imageUrl,
        },
      ],
      tracksPerSeed: 1,
      popularity: PopularityMode.BALANCED,
    });

    expect(result).toBeInstanceOf(GeneratedPlaylist);
    expect(context.assertAvailable).toHaveBeenCalled();
    expect(context.forMarket).toHaveBeenCalledWith('AR');
    expect(context.searchTracks).toHaveBeenCalledWith('artist:"Sade"', {
      limit: 10,
      offset: 0,
    });
    expect(result).toMatchObject({
      name: 'Blendify · Mix · Sade',
      seeds: [
        {
          type: 'artist',
          id: 'artist-1',
          name: 'Sade',
          imageUrl: 'https://images.example/sade.jpg',
        },
      ],
      generation: {
        kind: 'artist_mix',
        tracksPerSeed: 1,
        seeds: [
          {
            id: 'artist-1',
            name: 'Sade',
            imageUrl: 'https://images.example/sade.jpg',
          },
        ],
      },
    });
    expect(result.tracks.map((track) => track.id.getValue())).toEqual([
      'track-1',
    ]);
  });

  it('never uses a client-supplied Spotify link for cover artwork', async () => {
    const context = setup();
    context.searchTracks.mockResolvedValue([
      makeTrack({
        albumImageUrl: 'https://i.scdn.co/image/album',
        externalUrl: 'https://open.spotify.com/track/track-1',
      }),
    ]);

    const result = await context.useCase.execute({
      kind: 'artist_mix',
      artistIds: ['artist-1'],
      artists: [
        {
          id: 'artist-1',
          name: 'Sade',
          imageUrl: 'https://images.example/sade.jpg',
          externalUrl: 'https://attacker.example/artist',
        },
      ],
      tracksPerSeed: 1,
      popularity: PopularityMode.BALANCED,
    });

    expect(result.coverArtwork).toEqual({
      imageUrl: 'https://i.scdn.co/image/album',
      spotifyUrl: 'https://open.spotify.com/track/track-1',
    });
  });

  it('links catalog artist artwork to the artist on Spotify', async () => {
    const context = setup();
    const getArtistsByIds = jest.fn().mockResolvedValue([
      Artist.create({
        id: ArtistId.create('artist-1'),
        name: 'Sade',
        imageUrl: 'https://i.scdn.co/image/sade',
        externalUrl: 'https://open.spotify.com/artist/artist-1',
      }),
    ]);
    context.forMarket.mockReturnValue({
      searchTracks: context.searchTracks,
      getArtistsByIds,
    });

    const result = await context.useCase.execute({
      kind: 'artist_mix',
      artistIds: ['artist-1'],
      tracksPerSeed: 1,
      popularity: PopularityMode.BALANCED,
    });

    expect(getArtistsByIds).toHaveBeenCalledWith(['artist-1']);
    expect(result.coverArtwork).toEqual({
      imageUrl: 'https://i.scdn.co/image/sade',
      spotifyUrl: 'https://open.spotify.com/artist/artist-1',
    });
  });

  it('has no cover artwork when nothing carries a Spotify link', async () => {
    const context = setup();

    const result = await context.useCase.execute({
      kind: 'artist_mix',
      artistIds: ['artist-1'],
      artists: [
        {
          id: 'artist-1',
          name: 'Sade',
          imageUrl: 'https://images.example/sade.jpg',
        },
      ],
      tracksPerSeed: 1,
      popularity: PopularityMode.BALANCED,
    });

    expect(result.coverArtwork).toBeUndefined();
  });

  it('stops before catalog work when quota is blocked', async () => {
    const context = setup();
    context.assertAvailable.mockImplementation(() => {
      throw new BusinessRuleError(
        'Spotify quota exceeded',
        'SPOTIFY_QUOTA_EXCEEDED',
      );
    });

    await expect(
      context.useCase.execute({
        kind: 'artist_mix',
        artistIds: ['artist-1'],
        tracksPerSeed: 1,
        popularity: PopularityMode.BALANCED,
      }),
    ).rejects.toMatchObject({ code: 'SPOTIFY_QUOTA_EXCEEDED' });

    expect(context.forMarket).not.toHaveBeenCalled();
  });
});
