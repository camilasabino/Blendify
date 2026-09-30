import { TrackDeduplicationService } from './track-deduplication.service';
import { Track } from '@/domain/track/track.entity';
import { TrackId } from '@/domain/value-objects/track-id.vo';
import { ArtistId } from '@/domain/value-objects/artist-id.vo';

function track(overrides: {
  id: string;
  name: string;
  artistId?: string;
  popularity?: number | null;
}): Track {
  return Track.create({
    id: TrackId.create(overrides.id),
    name: overrides.name,
    artistId: ArtistId.create(overrides.artistId ?? 'artist-1'),
    artistName: 'Test Artist',
    durationMs: 200_000,
    popularity: overrides.popularity === undefined ? 50 : overrides.popularity,
    uri: `spotify:track:${overrides.id}`,
  });
}

describe('TrackDeduplicationService', () => {
  const service = new TrackDeduplicationService();

  it('prefers the standard version over Live / Acoustic / Remastered', () => {
    const result = service.deduplicate([
      track({ id: '1', name: 'Blinding Lights - Live', popularity: 90 }),
      track({ id: '2', name: 'Blinding Lights', popularity: 80 }),
      track({ id: '3', name: 'Blinding Lights (Acoustic)', popularity: 70 }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Blinding Lights');
    expect(result[0].id.getValue()).toBe('2');
  });

  it('drops exact duplicate ids and normalized title duplicates', () => {
    const result = service.deduplicate([
      track({ id: '1', name: 'Levitating' }),
      track({ id: '1', name: 'Levitating' }),
      track({ id: '2', name: 'Levitating (Remastered)' }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Levitating');
  });

  it('keeps distinct tracks for the same artist', () => {
    const result = service.deduplicate([
      track({ id: '1', name: 'Song A' }),
      track({ id: '2', name: 'Song B' }),
    ]);

    expect(result).toHaveLength(2);
  });

  it('does not treat same title from different artists as duplicates', () => {
    const result = service.deduplicate([
      track({ id: '1', name: 'Crazy', artistId: 'a1' }),
      track({ id: '2', name: 'Crazy', artistId: 'a2' }),
    ]);

    expect(result).toHaveLength(2);
  });

  it('when only alternates exist, keeps the more popular one', () => {
    const result = service.deduplicate([
      track({ id: '1', name: 'Hello - Live', popularity: 40 }),
      track({ id: '2', name: 'Hello (Acoustic)', popularity: 75 }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].id.getValue()).toBe('2');
  });

  it('keeps the known popularity when the other alternate is unknown', () => {
    const result = service.deduplicate([
      track({ id: '1', name: 'Hello - Live', popularity: null }),
      track({ id: '2', name: 'Hello (Acoustic)', popularity: 0 }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].id.getValue()).toBe('2');
    expect(result[0].popularity).toBe(0);
  });

  it('does not keep an unknown popularity ahead of a lower known one', () => {
    const result = service.deduplicate([
      track({ id: '1', name: 'Hello (Acoustic)', popularity: 10 }),
      track({ id: '2', name: 'Hello - Live', popularity: null }),
    ]);

    expect(result[0].id.getValue()).toBe('1');
    expect(result[0].popularity).toBe(10);
  });

  it('keeps the first track when both popularities are unknown', () => {
    const result = service.deduplicate([
      track({ id: '1', name: 'Hello - Live', popularity: null }),
      track({ id: '2', name: 'Hello (Acoustic)', popularity: null }),
    ]);

    expect(result[0].id.getValue()).toBe('1');
    expect(result[0].popularity).toBeNull();
  });

  it('still prefers a standard version with unknown popularity over a popular alternate', () => {
    const result = service.deduplicate([
      track({ id: '1', name: 'Hello - Live', popularity: 90 }),
      track({ id: '2', name: 'Hello', popularity: null }),
    ]);

    expect(result[0].id.getValue()).toBe('2');
    expect(result[0].popularity).toBeNull();
  });

  it('breaks a popularity tie between two alternates by keeping the first', () => {
    const result = service.deduplicate([
      track({ id: '1', name: 'Hello - Live', popularity: 60 }),
      track({ id: '2', name: 'Hello (Acoustic)', popularity: 60 }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].id.getValue()).toBe('1');
  });

  it('deduplicates within artist buckets independently', () => {
    const byArtist = new Map([
      [
        'a1',
        [
          track({ id: '1', name: 'Hit', artistId: 'a1' }),
          track({ id: '2', name: 'Hit - Live', artistId: 'a1' }),
        ],
      ],
      [
        'a2',
        [
          track({ id: '3', name: 'Hit', artistId: 'a2' }),
          track({ id: '4', name: 'Other', artistId: 'a2' }),
        ],
      ],
    ]);

    const result = service.deduplicateByArtist(byArtist);

    expect(result.get('a1')).toHaveLength(1);
    expect(result.get('a2')).toHaveLength(2);
  });
});
