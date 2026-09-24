import { PopularityMode, TrackOrderMode } from '@blendify/contracts';
import type { Playlist as PlaylistModel } from '@prisma/client';
import { Playlist } from '../../domain/playlist/playlist.entity';
import { Track } from '../../domain/track/track.entity';
import { ArtistId } from '../../domain/value-objects/artist-id.vo';
import { TrackId } from '../../domain/value-objects/track-id.vo';
import { PrismaPlaylistRepository } from './prisma-playlist.repository';
import type { PrismaService } from './prisma.service';

const generation = {
  kind: 'artist_mix' as const,
  version: 1 as const,
  popularity: PopularityMode.BALANCED,
  orderMode: TrackOrderMode.ARTIST,
  tracksPerSeed: 10,
  seeds: [{ id: 'kid-id', name: 'The Kid LAROI' }],
};

function row(tracks: unknown[]): PlaylistModel {
  return {
    id: 'playlist-1',
    userId: 'user-1',
    name: 'Evening mix',
    description: '',
    spotifyId: null,
    spotifyUrl: null,
    kind: 'artist_mix',
    status: 'PENDING',
    totalDurationMs: 141_000,
    seedCount: 1,
    trackCount: tracks.length,
    tracksPerSeed: 10,
    seeds: [{ type: 'artist', id: 'kid-id', name: 'The Kid LAROI' }],
    tracks: tracks as PlaylistModel['tracks'],
    generation,
    missingOnSpotify: false,
    syncedTrackCount: null,
    imageUrl: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function createRepository() {
  const prisma = {
    playlist: {
      findUnique: jest.fn(),
      upsert: jest.fn((args: { create: Omit<PlaylistModel, 'id'> }) =>
        Promise.resolve(row(args.create.tracks as unknown[])),
      ),
    },
  };
  return {
    prisma,
    repository: new PrismaPlaylistRepository(
      prisma as unknown as PrismaService,
    ),
  };
}

const legacyTrack = {
  id: 'track-1',
  name: 'Stay',
  artistId: 'kid-id',
  artistName: 'The Kid LAROI',
  durationMs: 141_000,
  popularity: 0,
  uri: 'spotify:track:track-1',
  albumImageUrl: null,
  previewUrl: null,
};

describe('PrismaPlaylistRepository track metadata', () => {
  it('reads tracks persisted before portable metadata existed', async () => {
    const { prisma, repository } = createRepository();
    prisma.playlist.findUnique.mockResolvedValue(row([legacyTrack]));

    const playlist = await repository.findById('playlist-1');
    const [track] = playlist?.tracks ?? [];

    expect(track.artistId.getValue()).toBe('kid-id');
    expect(track.artists).toEqual([{ id: 'kid-id', name: 'The Kid LAROI' }]);
    expect(track.isrc).toBeUndefined();
    expect(track.externalUrl).toBeUndefined();
  });

  it('persists and restores credited artists, isrc and external url', async () => {
    const { prisma, repository } = createRepository();
    const playlist = Playlist.create({
      id: 'playlist-1',
      userId: 'user-1',
      name: 'Evening mix',
      seeds: [{ type: 'artist', id: 'kid-id', name: 'The Kid LAROI' }],
      tracks: [
        Track.create({
          id: TrackId.create('track-1'),
          name: 'Stay',
          artistId: ArtistId.create('bieber-id'),
          artistName: 'Justin Bieber',
          durationMs: 141_000,
          popularity: 0,
          uri: 'spotify:track:track-1',
          artists: [
            { id: 'kid-id', name: 'The Kid LAROI' },
            { id: 'bieber-id', name: 'Justin Bieber' },
          ],
          isrc: 'USUM72105936',
          externalUrl: 'https://open.spotify.com/track/track-1',
        }),
      ],
      generation,
    });

    const saved = await repository.save(playlist);
    const [stored] = prisma.playlist.upsert.mock.calls[0][0].create
      .tracks as unknown as Array<Record<string, unknown>>;
    const [track] = saved.tracks;

    expect(stored).toMatchObject({
      artistId: 'bieber-id',
      artists: [
        { id: 'kid-id', name: 'The Kid LAROI' },
        { id: 'bieber-id', name: 'Justin Bieber' },
      ],
      isrc: 'USUM72105936',
      externalUrl: 'https://open.spotify.com/track/track-1',
    });
    expect(track.artistId.getValue()).toBe('bieber-id');
    expect(track.artists).toEqual([
      { id: 'kid-id', name: 'The Kid LAROI' },
      { id: 'bieber-id', name: 'Justin Bieber' },
    ]);
    expect(track.isrc).toBe('USUM72105936');
    expect(track.externalUrl).toBe('https://open.spotify.com/track/track-1');
  });
});
