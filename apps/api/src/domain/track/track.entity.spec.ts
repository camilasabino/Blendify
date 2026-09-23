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
