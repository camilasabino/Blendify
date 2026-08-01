import { PlaylistName } from './playlist-name.vo';

describe('PlaylistName', () => {
  it('trims and stores a valid name', () => {
    const name = PlaylistName.create('  Evening  ');
    expect(name.getValue()).toBe('Evening');
    expect(name.toString()).toBe('Evening');
    expect(name.equals(PlaylistName.create('Evening'))).toBe(true);
  });

  it('rejects empty and oversized names', () => {
    expect(() => PlaylistName.create('   ')).toThrow();
    expect(() => PlaylistName.create('x'.repeat(101))).toThrow();
  });
});
