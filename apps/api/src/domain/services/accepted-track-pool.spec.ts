import { Track } from '@/domain/track/track.entity';
import { ArtistId } from '@/domain/value-objects/artist-id.vo';
import { TrackId } from '@/domain/value-objects/track-id.vo';
import { AcceptedTrackPool } from './accepted-track-pool';

function track(
  id: string,
  name: string,
  artist = 'artist-a',
  popularity: number | null = 50,
): Track {
  return Track.create({
    id: TrackId.create(id),
    name,
    artistId: ArtistId.create(artist),
    artistName: artist,
    durationMs: 200_000,
    popularity,
    uri: `spotify:track:${id}`,
  });
}

function ids(pool: AcceptedTrackPool): string[] {
  return pool.tracks.map((item) => item.id.getValue());
}

describe('AcceptedTrackPool', () => {
  it('counts only tracks that pass the caller acceptance rule', () => {
    const pool = new AcceptedTrackPool(2, {
      accepts: (item) => item.name !== 'Creep',
    });

    expect(pool.offer(track('1', 'Creep'))).toBe(false);
    expect(pool.offer(track('2', 'Nude'))).toBe(true);
    expect(pool.missing).toBe(1);
  });

  it('rejects another version of an accepted recording without counting it', () => {
    const pool = new AcceptedTrackPool(3);

    pool.offer(track('1', 'Song'));
    expect(pool.offer(track('2', 'Song - Live'))).toBe(false);
    expect(pool.offer(track('1', 'Song'))).toBe(false);
    expect(pool.size).toBe(1);
  });

  it('keeps the preferred version in place when a better duplicate arrives', () => {
    const pool = new AcceptedTrackPool(2);

    pool.offer(track('live', 'Song - Live'));
    pool.offer(track('other', 'Other'));
    pool.offer(track('studio', 'Song'));

    expect(ids(pool)).toEqual(['studio', 'other']);
  });

  it('caps tracks per artist across every offer', () => {
    const pool = new AcceptedTrackPool(5, { maxPerArtist: 2 });

    pool.offer(track('1', 'One'));
    pool.offer(track('2', 'Two'));
    expect(pool.offer(track('3', 'Three'))).toBe(false);
    expect(pool.offer(track('4', 'Four', 'artist-b'))).toBe(true);
  });

  it('shares claimed recordings with other pools', () => {
    const claimed = new Set<string>();
    const first = new AcceptedTrackPool(1, { claimedKeys: claimed });
    const second = new AcceptedTrackPool(1, { claimedKeys: claimed });

    first.offer(track('1', 'Song'));

    expect(second.offer(track('2', 'Song - Remastered'))).toBe(false);
    expect(second.offer(track('3', 'Another'))).toBe(true);
  });

  it('stops accepting at the target until the target grows', () => {
    const pool = new AcceptedTrackPool(1);

    pool.offer(track('1', 'One'));
    expect(pool.isFull).toBe(true);
    expect(pool.offer(track('2', 'Two'))).toBe(false);

    pool.growTarget(2);
    expect(pool.offer(track('2', 'Two'))).toBe(true);
  });
});
