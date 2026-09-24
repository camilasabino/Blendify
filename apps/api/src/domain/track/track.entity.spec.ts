import { ArtistId } from '../value-objects/artist-id.vo';
import { TrackId } from '../value-objects/track-id.vo';
import { Track } from './track.entity';

function baseProps() {
  return {
    id: TrackId.create('track-1'),
    name: '  Song Name  ',
    artistId: ArtistId.create('artist-1'),
    artistName: '  Some Artist  ',
    durationMs: 200_000,
    popularity: 50,
    uri: '  spotify:track:1  ',
  };
}

describe('Track', () => {
  describe('create', () => {
    it('trims name and uri', () => {
      const track = Track.create(baseProps());

      expect(track.name).toBe('Song Name');
      expect(track.uri).toBe('spotify:track:1');
    });

    it('falls back to "Unknown Artist" when artist name is blank', () => {
      const track = Track.create({ ...baseProps(), artistName: '   ' });

      expect(track.artistName).toBe('Unknown Artist');
    });

    it('treats blank optional fields as absent', () => {
      const track = Track.create({
        ...baseProps(),
        albumName: '   ',
        albumImageUrl: '   ',
        previewUrl: '   ',
      });

      expect(track.albumName).toBeUndefined();
      expect(track.albumImageUrl).toBeUndefined();
      expect(track.previewUrl).toBeUndefined();
    });

    it('rejects a missing or blank name', () => {
      expect(() => Track.create({ ...baseProps(), name: '   ' })).toThrow(
        'Track name is required',
      );
    });

    it('rejects a missing or blank uri', () => {
      expect(() => Track.create({ ...baseProps(), uri: '   ' })).toThrow(
        'Track URI is required',
      );
    });

    it('rejects a negative duration', () => {
      expect(() => Track.create({ ...baseProps(), durationMs: -1 })).toThrow(
        'Track duration cannot be negative',
      );
    });
  });

  describe('portable metadata', () => {
    it('falls back to the attributed artist when no credits are given', () => {
      const track = Track.create(baseProps());

      expect(track.artists).toEqual([{ id: 'artist-1', name: 'Some Artist' }]);
      expect(track.isrc).toBeUndefined();
      expect(track.externalUrl).toBeUndefined();
    });

    it('falls back to the attributed artist when every credit is blank', () => {
      const track = Track.create({
        ...baseProps(),
        artists: [{ id: 'a', name: '  ' }, { name: '' }],
      });

      expect(track.artists).toEqual([{ id: 'artist-1', name: 'Some Artist' }]);
    });

    it('preserves provider order and trims credits', () => {
      const track = Track.create({
        ...baseProps(),
        artists: [
          { id: ' b ', name: ' Featured ' },
          { id: 'artist-1', name: 'Some Artist' },
          { name: ' No Id ' },
        ],
      });

      expect(track.artists).toEqual([
        { id: 'b', name: 'Featured' },
        { id: 'artist-1', name: 'Some Artist' },
        { name: 'No Id' },
      ]);
    });

    it('keeps attributed artist fields independent from credits', () => {
      const track = Track.create({
        ...baseProps(),
        artists: [
          { id: 'lead', name: 'Lead' },
          { id: 'artist-1', name: 'Some Artist' },
        ],
      });

      expect(track.artistId.getValue()).toBe('artist-1');
      expect(track.artistName).toBe('Some Artist');
    });

    it('keeps distinct artist ids that share a name', () => {
      const track = Track.create({
        ...baseProps(),
        artists: [
          { id: 'x1', name: 'Nirvana' },
          { id: 'x2', name: 'nirvana' },
        ],
      });

      expect(track.artists).toEqual([
        { id: 'x1', name: 'Nirvana' },
        { id: 'x2', name: 'nirvana' },
      ]);
    });

    it('deduplicates by id, and by normalized name only without ids', () => {
      const track = Track.create({
        ...baseProps(),
        artists: [
          { id: 'x1', name: 'One' },
          { id: 'x1', name: 'One (again)' },
          { name: 'Two  Words' },
          { name: 'two words' },
          { id: 'x3', name: 'Two Words' },
        ],
      });

      expect(track.artists).toEqual([
        { id: 'x1', name: 'One' },
        { name: 'Two  Words' },
        { id: 'x3', name: 'Two Words' },
      ]);
    });

    it('normalizes isrc and external url', () => {
      const track = Track.create({
        ...baseProps(),
        isrc: ' usum71703861 ',
        externalUrl: ' https://open.spotify.com/track/1 ',
      });

      expect(track.isrc).toBe('USUM71703861');
      expect(track.externalUrl).toBe('https://open.spotify.com/track/1');
    });

    it('treats blank isrc and external url as absent', () => {
      const track = Track.create({
        ...baseProps(),
        isrc: '  ',
        externalUrl: '  ',
      });

      expect(track.isrc).toBeUndefined();
      expect(track.externalUrl).toBeUndefined();
    });
  });

  describe('equals', () => {
    it('is true for tracks sharing the same id regardless of other fields', () => {
      const a = Track.create(baseProps());
      const b = Track.create({ ...baseProps(), name: 'Different Name' });

      expect(a.equals(b)).toBe(true);
    });

    it('is false for tracks with different ids', () => {
      const a = Track.create(baseProps());
      const b = Track.create({ ...baseProps(), id: TrackId.create('track-2') });

      expect(a.equals(b)).toBe(false);
    });
  });
});
