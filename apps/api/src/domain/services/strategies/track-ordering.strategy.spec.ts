import {
  RandomFlatStrategy,
  SortByArtistStrategy,
  SortByTitleStrategy,
  createOrderingStrategy,
} from './track-ordering.strategy';
import { TrackOrderMode } from '@blendify/contracts';
import { Track } from '../../track/track.entity';
import { TrackId } from '../../value-objects/track-id.vo';
import { ArtistId } from '../../value-objects/artist-id.vo';

function track(
  id: string,
  artistId: string,
  name = id,
  artistName = artistId,
): Track {
  return Track.create({
    id: TrackId.create(id),
    name,
    artistId: ArtistId.create(artistId),
    artistName,
    durationMs: 180_000,
    popularity: 50,
    uri: `spotify:track:${id}`,
  });
}

describe('TrackOrderingStrategy', () => {
  describe('SortByArtistStrategy', () => {
    it('sorts by artist name then title', () => {
      const tracksByArtist = new Map<string, Track[]>([
        ['z', [track('1', 'z', 'Zebra', 'Zoo')]],
        [
          'a',
          [track('2', 'a', 'Beta', 'Alpha'), track('3', 'a', 'Alpha', 'Alpha')],
        ],
      ]);
      const ordered = new SortByArtistStrategy().order(tracksByArtist);
      expect(ordered.map((t) => t.id.getValue())).toEqual(['3', '2', '1']);
    });
  });

  describe('SortByTitleStrategy', () => {
    it('sorts by track title', () => {
      const tracksByArtist = new Map<string, Track[]>([
        ['a', [track('1', 'a', 'Moon', 'A')]],
        ['b', [track('2', 'b', 'Dawn', 'B')]],
      ]);
      const ordered = new SortByTitleStrategy().order(tracksByArtist);
      expect(ordered.map((t) => t.name)).toEqual(['Dawn', 'Moon']);
    });
  });

  describe('RandomFlatStrategy', () => {
    it('keeps all tracks', () => {
      const tracksByArtist = new Map<string, Track[]>([
        ['a', [track('1', 'a'), track('2', 'a')]],
        ['b', [track('3', 'b')]],
      ]);
      const ordered = new RandomFlatStrategy(() => 0.2).order(tracksByArtist);
      expect(ordered.map((t) => t.id.getValue()).sort()).toEqual([
        '1',
        '2',
        '3',
      ]);
    });
  });

  describe('createOrderingStrategy', () => {
    it('maps every canonical track order mode', () => {
      expect(createOrderingStrategy(TrackOrderMode.ARTIST)).toBeInstanceOf(
        SortByArtistStrategy,
      );
      expect(createOrderingStrategy(TrackOrderMode.TITLE)).toBeInstanceOf(
        SortByTitleStrategy,
      );
      expect(createOrderingStrategy(TrackOrderMode.RANDOM)).toBeInstanceOf(
        RandomFlatStrategy,
      );
    });
  });
});
