import { DomainError } from '../errors/domain.error';
import { ArtistId } from './artist-id.vo';

describe('ArtistId', () => {
  it('trims whitespace when creating from raw input', () => {
    const id = ArtistId.create('  artist-1  ');

    expect(id.getValue()).toBe('artist-1');
    expect(id.toString()).toBe('artist-1');
  });

  it('rejects an empty or whitespace-only value', () => {
    expect(() => ArtistId.create('   ')).toThrow(DomainError);
    expect(() => ArtistId.create('   ')).toThrow('ArtistId cannot be empty');
  });

  it('considers two ids with the same value equal', () => {
    const a = ArtistId.create('artist-1');
    const b = ArtistId.create('artist-1');

    expect(a.equals(b)).toBe(true);
  });

  it('considers ids with different values unequal', () => {
    const a = ArtistId.create('artist-1');
    const b = ArtistId.create('artist-2');

    expect(a.equals(b)).toBe(false);
  });
});
