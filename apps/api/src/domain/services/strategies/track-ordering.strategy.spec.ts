import {
  GroupByArtistStrategy,
  ShuffleInterleaveStrategy,
} from './track-ordering.strategy';
import { Track } from '../../track/track.entity';
import { TrackId } from '../../value-objects/track-id.vo';
import { ArtistId } from '../../value-objects/artist-id.vo';

function track(id: string, artistId: string, name = id): Track {
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

describe('TrackOrderingStrategy', () => {
  describe('GroupByArtistStrategy', () => {
    it('keeps tracks grouped by artist in map insertion order', () => {
      const tracksByArtist = new Map<string, Track[]>([
        ['a1', [track('a1-1', 'a1'), track('a1-2', 'a1')]],
        ['a2', [track('a2-1', 'a2'), track('a2-2', 'a2')]],
      ]);

      const ordered = new GroupByArtistStrategy().order(tracksByArtist);
      const ids = ordered.map((t) => t.id.getValue());

      expect(ids).toEqual(['a1-1', 'a1-2', 'a2-1', 'a2-2']);
    });
  });

  describe('ShuffleInterleaveStrategy', () => {
    it('interleaves artists instead of grouping them', () => {
      const strategy = new ShuffleInterleaveStrategy(() => 0.999999);

      const tracksByArtist = new Map<string, Track[]>([
        ['a1', [track('a1-1', 'a1'), track('a1-2', 'a1')]],
        ['a2', [track('a2-1', 'a2'), track('a2-2', 'a2')]],
        ['a3', [track('a3-1', 'a3'), track('a3-2', 'a3')]],
      ]);

      const ordered = strategy.order(tracksByArtist);
      const artistSequence = ordered.map((t) => t.artistId.getValue());

      expect(artistSequence).toEqual(['a1', 'a2', 'a3', 'a1', 'a2', 'a3']);
      expect(artistSequence.slice(0, 3)).not.toEqual(['a1', 'a1', 'a1']);
    });

    it('includes every track exactly once', () => {
      const strategy = new ShuffleInterleaveStrategy(() => 0.5);
      const tracksByArtist = new Map<string, Track[]>([
        ['a1', [track('1', 'a1'), track('2', 'a1')]],
        ['a2', [track('3', 'a2')]],
      ]);

      const ordered = strategy.order(tracksByArtist);
      const ids = ordered.map((t) => t.id.getValue()).sort();

      expect(ids).toEqual(['1', '2', '3']);
    });

    it('handles uneven track counts across artists', () => {
      const strategy = new ShuffleInterleaveStrategy(() => 0.999999);
      const tracksByArtist = new Map<string, Track[]>([
        ['a1', [track('a1-1', 'a1'), track('a1-2', 'a1'), track('a1-3', 'a1')]],
        ['a2', [track('a2-1', 'a2')]],
      ]);

      const ordered = strategy.order(tracksByArtist);

      expect(ordered).toHaveLength(4);
      expect(ordered.map((t) => t.id.getValue())).toEqual([
        'a1-1',
        'a2-1',
        'a1-2',
        'a1-3',
      ]);
    });
  });
});
