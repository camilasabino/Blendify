import { ArtistId } from '../value-objects/artist-id.vo';
import { Artist } from './artist.entity';

describe('Artist', () => {
  describe('create', () => {
    it('trims the name and image URL', () => {
      const artist = Artist.create({
        id: ArtistId.create('artist-1'),
        name: '  Sade  ',
        imageUrl: '  https://example.com/sade.png  ',
      });

      expect(artist.name).toBe('Sade');
      expect(artist.imageUrl).toBe('https://example.com/sade.png');
    });

    it('treats a blank image URL as absent', () => {
      const artist = Artist.create({
        id: ArtistId.create('artist-1'),
        name: 'Sade',
        imageUrl: '   ',
      });

      expect(artist.imageUrl).toBeUndefined();
    });

    it('rejects a missing or blank name', () => {
      expect(() =>
        Artist.create({ id: ArtistId.create('artist-1'), name: '   ' }),
      ).toThrow('Artist name is required');
    });
  });

  describe('equals', () => {
    it('is true for artists sharing the same id regardless of other fields', () => {
      const a = Artist.create({
        id: ArtistId.create('artist-1'),
        name: 'Sade',
      });
      const b = Artist.create({
        id: ArtistId.create('artist-1'),
        name: 'Different Name',
      });

      expect(a.equals(b)).toBe(true);
    });

    it('is false for artists with different ids', () => {
      const a = Artist.create({
        id: ArtistId.create('artist-1'),
        name: 'Sade',
      });
      const b = Artist.create({
        id: ArtistId.create('artist-2'),
        name: 'Sade',
      });

      expect(a.equals(b)).toBe(false);
    });
  });
});
