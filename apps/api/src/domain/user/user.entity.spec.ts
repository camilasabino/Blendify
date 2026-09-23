import { User } from './user.entity';

describe('User', () => {
  describe('create', () => {
    it('creates a user with trimmed required fields', () => {
      const user = User.create({
        id: '  user-1  ',
        spotifyId: '  spotify-1  ',
        displayName: '  Camila  ',
      });

      expect(user.id).toBe('user-1');
      expect(user.spotifyId).toBe('spotify-1');
      expect(user.displayName).toBe('Camila');
      expect(user.email).toBeUndefined();
      expect(user.imageUrl).toBeUndefined();
    });

    it('trims optional email and imageUrl when provided', () => {
      const user = User.create({
        id: 'user-1',
        spotifyId: 'spotify-1',
        displayName: 'Camila',
        email: '  camila@example.com  ',
        imageUrl: '  https://example.com/pic.png  ',
      });

      expect(user.email).toBe('camila@example.com');
      expect(user.imageUrl).toBe('https://example.com/pic.png');
    });

    it('treats blank optional email and imageUrl as absent', () => {
      const user = User.create({
        id: 'user-1',
        spotifyId: 'spotify-1',
        displayName: 'Camila',
        email: '   ',
        imageUrl: '   ',
      });

      expect(user.email).toBeUndefined();
      expect(user.imageUrl).toBeUndefined();
    });

    it('rejects a missing or blank id', () => {
      expect(() =>
        User.create({
          id: '   ',
          spotifyId: 'spotify-1',
          displayName: 'Camila',
        }),
      ).toThrow('User id is required');
    });

    it('rejects a missing or blank Spotify id', () => {
      expect(() =>
        User.create({ id: 'user-1', spotifyId: '   ', displayName: 'Camila' }),
      ).toThrow('User Spotify id is required');
    });

    it('rejects a missing or blank display name', () => {
      expect(() =>
        User.create({
          id: 'user-1',
          spotifyId: 'spotify-1',
          displayName: '   ',
        }),
      ).toThrow('User display name is required');
    });
  });
});
