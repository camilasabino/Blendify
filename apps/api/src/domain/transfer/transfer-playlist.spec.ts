import type { PlaylistGeneration } from '@blendify/contracts';
import { MAX_TRACKS } from '../constants';
import { GeneratedPlaylist } from '../playlist/generated-playlist';
import { Track } from '../track/track.entity';
import { ArtistId } from '../value-objects/artist-id.vo';
import { TrackId } from '../value-objects/track-id.vo';
import { toTransferPlaylist } from './transfer-playlist';

const generation: PlaylistGeneration = {
  version: 1,
  kind: 'artist_mix',
  tracksPerSeed: 1,
  seeds: [{ id: 'daft-punk', name: 'Daft Punk' }],
  popularity: 'balanced',
  orderMode: 'random',
};

function makeTrack(
  index: number,
  extra: Partial<Parameters<typeof Track.create>[0]> = {},
): Track {
  return Track.create({
    id: TrackId.create(`track-${index}`),
    name: `Song ${index}`,
    artistId: ArtistId.create('daft-punk'),
    artistName: 'Daft Punk',
    durationMs: 200_000,
    popularity: 42,
    uri: `spotify:track:track-${index}`,
    albumName: 'Random Access Memories',
    albumImageUrl: 'https://images.example/album.jpg',
    previewUrl: 'https://previews.example/track.mp3',
    externalUrl: `https://open.spotify.com/track/track-${index}`,
    ...extra,
  });
}

function makePlaylist(tracks: Track[], description?: string) {
  return GeneratedPlaylist.create({
    name: 'Blendify · Mix · Daft Punk',
    description,
    generation,
    seeds: [{ type: 'artist', id: 'daft-punk', name: 'Daft Punk' }],
    tracks,
  });
}

describe('toTransferPlaylist', () => {
  it('maps title, description, and a single track', () => {
    const playlist = makePlaylist(
      [makeTrack(1, { isrc: 'usqx91300105' })],
      'Made with Blendify from Daft Punk.',
    );

    expect(toTransferPlaylist(playlist)).toEqual({
      title: 'Blendify · Mix · Daft Punk',
      description: 'Made with Blendify from Daft Punk.',
      tracks: [
        { title: 'Song 1', artists: ['Daft Punk'], isrc: 'USQX91300105' },
      ],
    });
  });

  it('preserves every credited artist in provider order', () => {
    const playlist = makePlaylist([
      makeTrack(1, {
        name: 'Get Lucky',
        artists: [
          { id: 'daft-punk', name: 'Daft Punk' },
          { id: 'pharrell', name: 'Pharrell Williams' },
          { id: 'nile', name: 'Nile Rodgers' },
        ],
      }),
    ]);

    expect(toTransferPlaylist(playlist).tracks[0].artists).toEqual([
      'Daft Punk',
      'Pharrell Williams',
      'Nile Rodgers',
    ]);
  });

  it('keeps credits instead of the attributed artist', () => {
    const playlist = makePlaylist([
      makeTrack(1, {
        artistId: ArtistId.create('pharrell'),
        artistName: 'Pharrell Williams',
        artists: [
          { id: 'daft-punk', name: 'Daft Punk' },
          { id: 'pharrell', name: 'Pharrell Williams' },
        ],
      }),
    ]);

    expect(toTransferPlaylist(playlist).tracks[0].artists).toEqual([
      'Daft Punk',
      'Pharrell Williams',
    ]);
  });

  it('maps the maximum number of tracks in order', () => {
    const tracks = Array.from({ length: MAX_TRACKS }, (_, index) =>
      makeTrack(index + 1),
    );

    const transfer = toTransferPlaylist(makePlaylist(tracks));

    expect(transfer.tracks).toHaveLength(MAX_TRACKS);
    expect(transfer.tracks.map((track) => track.title)).toEqual(
      tracks.map((track) => track.name),
    );
  });

  it('omits an empty description and a missing or malformed ISRC', () => {
    const transfer = toTransferPlaylist(
      makePlaylist([makeTrack(1), makeTrack(2, { isrc: 'not-an-isrc' })]),
    );

    expect(transfer).not.toHaveProperty('description');
    expect(transfer.tracks[0]).not.toHaveProperty('isrc');
    expect(transfer.tracks[1]).not.toHaveProperty('isrc');
  });

  it('carries no identifiers, URLs, recipe, or catalog metadata', () => {
    const transfer = toTransferPlaylist(
      makePlaylist([makeTrack(1, { isrc: 'USQX91300105' })], 'Description'),
    );

    expect(Object.keys(transfer).sort()).toEqual([
      'description',
      'title',
      'tracks',
    ]);
    expect(Object.keys(transfer.tracks[0]).sort()).toEqual([
      'artists',
      'isrc',
      'title',
    ]);
    const serialized = JSON.stringify(transfer);
    for (const leaked of [
      'spotify:',
      'open.spotify.com',
      'images.example',
      'previews.example',
      'track-1',
      'daft-punk',
      'Random Access Memories',
      'balanced',
    ]) {
      expect(serialized).not.toContain(leaked);
    }
  });
});
