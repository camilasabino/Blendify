import type { PlaylistGeneration } from '@blendify/contracts';
import { MAX_TRACKS } from '../constants';
import { Track } from '../track/track.entity';
import { ArtistId } from '../value-objects/artist-id.vo';
import { TrackId } from '../value-objects/track-id.vo';
import { GeneratedPlaylist } from './generated-playlist';

function makeTrack(index: number): Track {
  return Track.create({
    id: TrackId.create(`track-${index}`),
    name: `Song ${index}`,
    artistId: ArtistId.create('artist-1'),
    artistName: 'Sade',
    durationMs: 200_000,
    popularity: 50,
    uri: `spotify:track:track-${index}`,
  });
}

const generation: PlaylistGeneration = {
  version: 1,
  kind: 'artist_mix',
  tracksPerSeed: 2,
  seeds: [{ id: 'artist-1', name: 'Sade', imageUrl: null }],
  popularity: 'balanced',
  orderMode: 'random',
};

const seeds = [
  { type: 'artist' as const, id: 'artist-1', name: 'Sade', imageUrl: null },
];

describe('GeneratedPlaylist', () => {
  it('normalizes name and description and keeps the recipe', () => {
    const playlist = GeneratedPlaylist.create({
      name: '  Sade Mix  ',
      description: '  Late night  ',
      generation,
      seeds,
      tracks: [makeTrack(1), makeTrack(2)],
      coverCandidateUrl: 'https://images.example/sade.jpg',
    });

    expect(playlist.name).toBe('Sade Mix');
    expect(playlist.description).toBe('Late night');
    expect(playlist.generation).toEqual(generation);
    expect(playlist.seeds).toEqual(seeds);
    expect(playlist.tracks).toHaveLength(2);
    expect(playlist.coverCandidateUrl).toBe('https://images.example/sade.jpg');
  });

  it('does not share mutable state with its input', () => {
    const input = { name: 'Mix', generation, seeds, tracks: [makeTrack(1)] };
    const playlist = GeneratedPlaylist.create(input);

    input.tracks.push(makeTrack(2));
    input.seeds[0].name = 'Changed';

    expect(playlist.tracks).toHaveLength(1);
    expect(playlist.seeds[0].name).toBe('Sade');
  });

  it('carries no destination or ownership state', () => {
    const playlist = GeneratedPlaylist.create({
      name: 'Mix',
      generation,
      seeds,
      tracks: [makeTrack(1)],
    });

    expect(Object.keys(playlist).sort()).toEqual([
      'coverCandidateUrl',
      'description',
      'generation',
      'name',
      'seeds',
      'tracks',
    ]);
  });

  it('requires at least one seed', () => {
    expect(() =>
      GeneratedPlaylist.create({
        name: 'Mix',
        generation,
        seeds: [],
        tracks: [makeTrack(1)],
      }),
    ).toThrow(/seed/i);
  });

  it('rejects more tracks than the playlist cap', () => {
    expect(() =>
      GeneratedPlaylist.create({
        name: 'Mix',
        generation,
        seeds,
        tracks: Array.from({ length: MAX_TRACKS + 1 }, (_, i) => makeTrack(i)),
      }),
    ).toThrow(/too many tracks/i);
  });

  it('rejects an empty name', () => {
    expect(() =>
      GeneratedPlaylist.create({
        name: '   ',
        generation,
        seeds,
        tracks: [makeTrack(1)],
      }),
    ).toThrow(/invalid playlist name/i);
  });
});
