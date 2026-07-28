import { PlaylistGenerationService } from './playlist-generation.service';
import { Track } from '../track/track.entity';
import { TrackId } from '../value-objects/track-id.vo';
import { ArtistId } from '../value-objects/artist-id.vo';
import { MAX_TRACKS } from '../constants';

function simpleTracks(artistId: string, names: string[]): Track[] {
  return names.map((name, i) =>
    Track.create({
      id: TrackId.create(`${artistId}-${i}`),
      name,
      artistId: ArtistId.create(artistId),
      artistName: `Artist ${artistId}`,
      durationMs: 180_000,
      popularity: 80 - i,
      uri: `spotify:track:${artistId}-${i}`,
    }),
  );
}

describe('PlaylistGenerationService', () => {
  const service = new PlaylistGenerationService();

  it('generates an interleaved playlist with the requested songs per artist', () => {
    const tracksByArtist = new Map([
      ['a', simpleTracks('a', ['A1', 'A2', 'A3', 'A4'])],
      ['b', simpleTracks('b', ['B1', 'B2', 'B3', 'B4'])],
    ]);

    const { tracks, allocation } = service.generate(tracksByArtist, 2, false);

    expect(allocation.get('a')).toBe(2);
    expect(allocation.get('b')).toBe(2);
    expect(tracks).toHaveLength(4);
    expect(tracks.map((t) => t.name)).toEqual(['A1', 'A2', 'B1', 'B2']);
  });

  it('filters alternate versions when a standard exists', () => {
    const tracksByArtist = new Map([
      [
        'a',
        simpleTracks('a', [
          'Midnight',
          'Midnight - Live',
          'Sunrise',
          'Sunrise (Acoustic)',
        ]),
      ],
    ]);

    const { tracks } = service.generate(tracksByArtist, 10, false);

    expect(tracks.map((t) => t.name)).toEqual(['Midnight', 'Sunrise']);
  });

  it('prorates when total would exceed MAX_TRACKS', () => {
    const tracksByArtist = new Map<string, Track[]>();
    for (let i = 0; i < 25; i += 1) {
      const id = `artist-${i}`;
      tracksByArtist.set(
        id,
        Array.from({ length: 40 }, (_, j) =>
          Track.create({
            id: TrackId.create(`${id}-${j}`),
            name: `Track ${j}`,
            artistId: ArtistId.create(id),
            artistName: id,
            durationMs: 200_000,
            popularity: 50,
            uri: `spotify:track:${id}-${j}`,
          }),
        ),
      );
    }

    const { tracks, allocation } = service.generate(tracksByArtist, 30, false);

    expect(tracks.length).toBeLessThanOrEqual(MAX_TRACKS);
    expect(tracks).toHaveLength(MAX_TRACKS);
    expect(sum(allocation)).toBe(MAX_TRACKS);
  });

  it('takes all available when an artist has fewer songs than requested', () => {
    const tracksByArtist = new Map([
      ['a', simpleTracks('a', ['Only One'])],
      ['b', simpleTracks('b', ['B1', 'B2', 'B3', 'B4', 'B5'])],
    ]);

    const { tracks, allocation } = service.generate(tracksByArtist, 5, false);

    expect(allocation.get('a')).toBe(1);
    expect(allocation.get('b')).toBe(5);
    expect(tracks).toHaveLength(6);
  });

  it('under the cap, does not give other artists more than songsPerArtist', () => {
    const tracksByArtist = new Map([
      ['short', simpleTracks('short', ['S1'])],
      [
        'long',
        simpleTracks('long', ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8']),
      ],
      ['mid', simpleTracks('mid', ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'])],
    ]);

    const { tracks, allocation } = service.generate(tracksByArtist, 4, false);

    expect(allocation.get('short')).toBe(1);
    expect(allocation.get('long')).toBe(4);
    expect(allocation.get('mid')).toBe(4);
    expect(tracks).toHaveLength(9);
  });

  it('when prorating to MAX_TRACKS, redistributes unused quota', () => {
    const tracksByArtist = new Map<string, Track[]>();
    for (let i = 0; i < 10; i += 1) {
      const id = `artist-${i}`;
      const count = i === 0 ? 5 : 60;
      tracksByArtist.set(
        id,
        Array.from({ length: count }, (_, j) =>
          Track.create({
            id: TrackId.create(`${id}-${j}`),
            name: `Track ${j}`,
            artistId: ArtistId.create(id),
            artistName: id,
            durationMs: 200_000,
            popularity: 50,
            uri: `spotify:track:${id}-${j}`,
          }),
        ),
      );
    }

    const { tracks, allocation } = service.generate(tracksByArtist, 60, false);

    expect(allocation.get('artist-0')).toBe(5);
    expect(sum(allocation)).toBe(MAX_TRACKS);
    expect(tracks).toHaveLength(MAX_TRACKS);
    expect(allocation.get('artist-1')).toBeGreaterThan(20);
  });
});

function sum(map: Map<string, number>): number {
  return Array.from(map.values()).reduce((a, b) => a + b, 0);
}
