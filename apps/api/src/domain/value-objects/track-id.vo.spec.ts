import { DomainError } from '../errors/domain.error';
import { TrackId } from './track-id.vo';

describe('TrackId', () => {
  it('trims whitespace when creating from raw input', () => {
    const id = TrackId.create('  track-1  ');

    expect(id.getValue()).toBe('track-1');
    expect(id.toString()).toBe('track-1');
  });

  it('rejects an empty or whitespace-only value', () => {
    expect(() => TrackId.create('   ')).toThrow(DomainError);
    expect(() => TrackId.create('   ')).toThrow('TrackId cannot be empty');
  });

  it('considers two ids with the same value equal', () => {
    const a = TrackId.create('track-1');
    const b = TrackId.create('track-1');

    expect(a.equals(b)).toBe(true);
  });

  it('considers ids with different values unequal', () => {
    const a = TrackId.create('track-1');
    const b = TrackId.create('track-2');

    expect(a.equals(b)).toBe(false);
  });
});
