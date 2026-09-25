import {
  GeneratedPlaylistSchema,
  TrackSchema,
  type PlaylistGeneration,
} from '@blendify/contracts';
import { GeneratedPlaylist } from '../../domain/playlist/generated-playlist';
import { Track } from '../../domain/track/track.entity';
import { ArtistId } from '../../domain/value-objects/artist-id.vo';
import { TrackId } from '../../domain/value-objects/track-id.vo';
import {
  toGeneratedPlaylistResponse,
  toTrackResponse,
} from './playlist-response.dto';

function makeTrack(extra: Partial<Parameters<typeof Track.create>[0]> = {}) {
  return Track.create({
    id: TrackId.create('track-1'),
    name: 'Stay',
    artistId: ArtistId.create('bieber-id'),
    artistName: 'Justin Bieber',
    durationMs: 141_000,
    popularity: 0,
    uri: 'spotify:track:track-1',
    ...extra,
  });
}

describe('toTrackResponse', () => {
  it('exposes portable metadata without changing the attributed artist', () => {
    const response = toTrackResponse(
      makeTrack({
        artists: [
          { id: 'kid-id', name: 'The Kid LAROI' },
          { id: 'bieber-id', name: 'Justin Bieber' },
        ],
        isrc: 'USUM72105936',
        externalUrl: 'https://open.spotify.com/track/track-1',
      }),
    );

    expect(TrackSchema.parse(response)).toEqual(response);
    expect(response).toMatchObject({
      artistId: 'bieber-id',
      artistName: 'Justin Bieber',
      artists: [
        { id: 'kid-id', name: 'The Kid LAROI' },
        { id: 'bieber-id', name: 'Justin Bieber' },
      ],
      isrc: 'USUM72105936',
      externalUrl: 'https://open.spotify.com/track/track-1',
    });
  });

  it('exposes the attributed artist as credit when none are known', () => {
    const response = toTrackResponse(makeTrack());

    expect(TrackSchema.parse(response)).toEqual(response);
    expect(response.artists).toEqual([
      { id: 'bieber-id', name: 'Justin Bieber' },
    ]);
    expect(response.isrc).toBeUndefined();
    expect(response.externalUrl).toBeUndefined();
  });
});

describe('toGeneratedPlaylistResponse', () => {
  const generation: PlaylistGeneration = {
    version: 1,
    kind: 'artist_mix',
    tracksPerSeed: 1,
    seeds: [{ id: 'bieber-id', name: 'Justin Bieber' }],
    popularity: 'balanced',
    orderMode: 'random',
  };

  it('exposes the generated playlist without destination state', () => {
    const track = makeTrack({ isrc: 'USUM72105936' });
    const response = toGeneratedPlaylistResponse(
      GeneratedPlaylist.create({
        name: 'Blendify · Mix · Justin Bieber',
        description: 'Made with Blendify.',
        generation,
        seeds: [{ type: 'artist', id: 'bieber-id', name: 'Justin Bieber' }],
        tracks: [track],
        coverArtwork: {
          imageUrl: 'https://i.scdn.co/image/cover',
          spotifyUrl: 'https://open.spotify.com/track/1',
        },
      }),
      null,
    );

    expect(GeneratedPlaylistSchema.parse(response)).toEqual(response);
    expect(response).toEqual({
      name: 'Blendify · Mix · Justin Bieber',
      description: 'Made with Blendify.',
      generation,
      seeds: [{ type: 'artist', id: 'bieber-id', name: 'Justin Bieber' }],
      tracks: [toTrackResponse(track)],
      coverArtwork: {
        imageUrl: 'https://i.scdn.co/image/cover',
        spotifyUrl: 'https://open.spotify.com/track/1',
      },
      transfer: null,
    });
    for (const key of ['id', 'userId', 'spotifyId', 'spotifyUrl', 'status']) {
      expect(response).not.toHaveProperty(key);
    }
  });

  it('omits artwork that has no Spotify link', () => {
    const response = toGeneratedPlaylistResponse(
      GeneratedPlaylist.create({
        name: 'Blendify · Mix · Justin Bieber',
        generation,
        seeds: [{ type: 'artist', id: 'bieber-id', name: 'Justin Bieber' }],
        tracks: [makeTrack()],
      }),
      null,
    );

    expect(response).not.toHaveProperty('coverArtwork');
  });

  it('exposes the transfer offer with an ISO expiry', () => {
    const response = toGeneratedPlaylistResponse(
      GeneratedPlaylist.create({
        name: 'Blendify · Mix · Justin Bieber',
        generation,
        seeds: [{ type: 'artist', id: 'bieber-id', name: 'Justin Bieber' }],
        tracks: [makeTrack()],
      }),
      { token: 'signed', expiresAt: new Date('2026-09-25T13:00:00Z') },
    );

    expect(response.transfer).toEqual({
      token: 'signed',
      expiresAt: '2026-09-25T13:00:00.000Z',
    });
    expect(GeneratedPlaylistSchema.parse(response)).toEqual(response);
  });
});
