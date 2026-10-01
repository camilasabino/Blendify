import { TrackOrderMode } from '@blendify/contracts';
import {
  GenrePlaylistGenerationService,
  selectTracksWithArtistDiversity,
  tracksPerSeedArtist,
} from './genre-playlist-generation.service';
import { Track } from '@/domain/track/track.entity';
import { TrackId } from '@/domain/value-objects/track-id.vo';
import { ArtistId } from '@/domain/value-objects/artist-id.vo';

function track(
  artistId: string,
  name: string,
  id = `${artistId}-${name}`,
): Track {
  return Track.create({
    id: TrackId.create(id),
    name,
    artistId: ArtistId.create(artistId),
    artistName: artistId,
    durationMs: 180_000,
    popularity: 50,
    uri: `spotify:track:${id}`,
  });
}

describe('selectTracksWithArtistDiversity', () => {
  it('spreads picks across artists before repeating anyone', () => {
    const pool = [
      track('a', 'A1'),
      track('a', 'A2'),
      track('a', 'A3'),
      track('b', 'B1'),
      track('b', 'B2'),
      track('c', 'C1'),
      track('c', 'C2'),
    ];
    const picked = selectTracksWithArtistDiversity(pool, 6);
    const counts = picked.reduce<Record<string, number>>((acc, t) => {
      const id = t.artistId.getValue();
      acc[id] = (acc[id] ?? 0) + 1;
      return acc;
    }, {});
    expect(picked).toHaveLength(6);
    expect(counts.a).toBe(2);
    expect(counts.b).toBe(2);
    expect(counts.c).toBe(2);
  });

  it('keeps per-artist cap low for broad mixes', () => {
    const pool = Array.from({ length: 5 }, (_, i) =>
      track('star', `Hit ${i}`, `star-${i}`),
    ).concat([track('other', 'Only')]);
    const picked = selectTracksWithArtistDiversity(pool, 4, {
      maxPerArtist: 2,
    });
    const starCount = picked.filter(
      (t) => t.artistId.getValue() === 'star',
    ).length;
    expect(starCount).toBeLessThanOrEqual(2);
    expect(picked.some((t) => t.artistId.getValue() === 'other')).toBe(true);
  });
});

describe('tracksPerSeedArtist', () => {
  it('stays small when many seeds cover the budget', () => {
    expect(tracksPerSeedArtist(40, 28)).toBe(2);
  });

  it('defaults when there are no seed artists', () => {
    expect(tracksPerSeedArtist(10, 0)).toBe(2);
  });

  it('caps fetch depth at three tracks per artist', () => {
    expect(tracksPerSeedArtist(40, 2)).toBe(3);
  });
});

describe('selectTracksWithArtistDiversity edge cases', () => {
  it('returns empty when nothing is needed', () => {
    expect(selectTracksWithArtistDiversity([track('a', 'A1')], 0)).toEqual([]);
  });
});

describe('GenrePlaylistGenerationService', () => {
  it('dedupes across genres and respects MAX_TRACKS ordering', () => {
    const service = new GenrePlaylistGenerationService();
    const tracksByGenre = new Map([
      [
        'jazz',
        [
          track('a', 'A1'),
          track('a', 'A1 - Live', 'a-live'),
          track('b', 'B1'),
          track('c', 'C1'),
        ],
      ],
      ['soul', [track('b', 'B1 Dup', 'b-dup'), track('d', 'D1')]],
    ]);

    const result = service.generate({
      tracksByGenre,
      tracksPerSeed: 3,
      orderMode: TrackOrderMode.ARTIST,
    });

    expect(result.allocation.get('jazz')).toBeGreaterThan(0);
    expect(result.tracks.length).toBeGreaterThan(0);
    const names = result.tracks.map((t) => t.name);
    expect(names).not.toContain('A1 - Live');
  });

  it('replaces a track already taken by an earlier genre with an unused candidate of the later genre', () => {
    const service = new GenrePlaylistGenerationService();
    const shared = [track('s1', 'Shared 1'), track('s2', 'Shared 2')];
    const tracksByGenre = new Map([
      [
        'rock',
        [...shared, track('r1', 'R1'), track('r2', 'R2'), track('r3', 'R3')],
      ],
      [
        'pop',
        [
          ...shared,
          track('p1', 'P1'),
          track('p2', 'P2'),
          track('p3', 'P3'),
          track('p4', 'P4'),
          track('p5', 'P5'),
        ],
      ],
    ]);

    const result = service.generate({
      tracksByGenre,
      tracksPerSeed: 5,
      orderMode: TrackOrderMode.ARTIST,
    });

    const artists = result.tracks.map((t) => t.artistId.getValue());
    expect(result.tracks).toHaveLength(10);
    expect(new Set(artists).size).toBe(10);
    expect(artists.filter((id) => id.startsWith('p'))).toHaveLength(5);
    expect(result.allocation.get('pop')).toBe(5);
  });
});
