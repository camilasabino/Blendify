import { PopularityMode, type PlaylistDetail } from '@blendify/contracts';
import { Artist } from '../../domain/artist/artist.entity';
import { BusinessRuleError } from '../../domain/errors/business-rule.error';
import type { DiscoveryCatalogPort } from '../../domain/repositories/discovery-catalog.port';
import type { MusicProviderPort } from '../../domain/repositories/music-provider.port';
import type { UsageStatsRepositoryPort } from '../../domain/repositories/usage-stats.repository.port';
import type { UserRepositoryPort } from '../../domain/repositories/user.repository.port';
import { Track } from '../../domain/track/track.entity';
import { User } from '../../domain/user/user.entity';
import { ArtistId } from '../../domain/value-objects/artist-id.vo';
import { TrackId } from '../../domain/value-objects/track-id.vo';
import type { PublishPlaylistService } from '../services/publish-playlist.service';
import { GeneratePlaylistUseCase } from './generate-playlist.use-case';

function makeTrack(): Track {
  return Track.create({
    id: TrackId.create('track-1'),
    name: 'Smooth Operator',
    artistId: ArtistId.create('artist-1'),
    artistName: 'Sade',
    durationMs: 250_000,
    popularity: 80,
    uri: 'spotify:track:track-1',
  });
}

function setup() {
  const artist = Artist.create({
    id: ArtistId.create('artist-1'),
    name: 'Sade',
    imageUrl: 'https://images.example/sade.jpg',
  });
  const searchTracks = jest.fn().mockResolvedValue([makeTrack()]);
  const provider = { searchTracks } as unknown as MusicProviderPort;
  const forUser = jest.fn().mockReturnValue(provider);
  const assertAvailable = jest.fn();
  const findById = jest.fn().mockResolvedValue(
    User.create({
      id: 'user-1',
      spotifyId: 'spotify-user-1',
      displayName: 'Listener',
    }),
  );
  const recordMix = jest.fn().mockResolvedValue(undefined);
  type PublishInput = Parameters<PublishPlaylistService['execute']>[0];
  const published: PublishInput[] = [];
  const publish = jest.fn((input: PublishInput) => {
    published.push(input);
    return Promise.resolve({
      id: 'playlist-result',
    } as unknown as PlaylistDetail);
  });

  const useCase = new GeneratePlaylistUseCase(
    { forUser },
    { assertAvailable },
    {
      isConfigured: () => false,
    } as unknown as DiscoveryCatalogPort,
    { findById } as unknown as UserRepositoryPort,
    { recordMix } as unknown as UsageStatsRepositoryPort,
    { execute: publish } as unknown as PublishPlaylistService,
  );

  return {
    artist,
    assertAvailable,
    findById,
    forUser,
    publish,
    published,
    recordMix,
    searchTracks,
    useCase,
  };
}

describe('GeneratePlaylistUseCase', () => {
  it('checks quota, publishes canonical seeds, and records usage', async () => {
    const context = setup();

    const result = await context.useCase.execute({
      userId: 'user-1',
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
      persistToLibrary: true,
    });

    expect(result).toEqual({ id: 'playlist-result' });
    expect(context.assertAvailable).toHaveBeenCalled();
    expect(context.forUser).toHaveBeenCalledWith('user-1');
    expect(context.searchTracks).toHaveBeenCalledWith('artist:"Sade"', {
      limit: 10,
      offset: 0,
    });
    expect(context.publish).toHaveBeenCalledTimes(1);
    expect(context.published[0]).toMatchObject({
      spotifyUserId: 'spotify-user-1',
      persistToLibrary: true,
    });
    expect(context.published[0].playlist).toMatchObject({
      kind: 'artist_mix',
      seeds: [
        {
          type: 'artist',
          id: 'artist-1',
          name: 'Sade',
          imageUrl: 'https://images.example/sade.jpg',
        },
      ],
    });
    expect(context.recordMix).toHaveBeenCalledWith({
      userId: 'user-1',
      kind: 'artist',
      seeds: [
        {
          kind: 'artist',
          seedKey: 'artist-1',
          name: 'Sade',
          imageUrl: 'https://images.example/sade.jpg',
        },
      ],
    });
  });

  it('stops before provider work when quota is blocked', async () => {
    const context = setup();
    context.assertAvailable.mockImplementation(() => {
      throw new BusinessRuleError(
        'Spotify quota exceeded',
        'SPOTIFY_QUOTA_EXCEEDED',
      );
    });

    await expect(
      context.useCase.execute({
        userId: 'user-1',
        kind: 'artist_mix',
        artistIds: ['artist-1'],
        tracksPerSeed: 1,
        popularity: PopularityMode.BALANCED,
      }),
    ).rejects.toMatchObject({ code: 'SPOTIFY_QUOTA_EXCEEDED' });

    expect(context.forUser).not.toHaveBeenCalled();
    expect(context.publish).not.toHaveBeenCalled();
    expect(context.recordMix).not.toHaveBeenCalled();
  });
});
