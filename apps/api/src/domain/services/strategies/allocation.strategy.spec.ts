import { EquitableAllocationStrategy } from './allocation.strategy';
import { MAX_TRACKS } from '../../constants';

describe('EquitableAllocationStrategy', () => {
  const strategy = new EquitableAllocationStrategy();

  it('allocates the requested songs per artist when under the cap', () => {
    const allocation = strategy.allocate({
      artistIds: ['a', 'b', 'c'],
      songsPerArtist: 10,
      availableByArtist: new Map([
        ['a', 20],
        ['b', 20],
        ['c', 20],
      ]),
    });

    expect(allocation.get('a')).toBe(10);
    expect(allocation.get('b')).toBe(10);
    expect(allocation.get('c')).toBe(10);
    expect(sum(allocation)).toBe(30);
  });

  it('prorates equitably when requested total exceeds MAX_TRACKS', () => {
    const artistIds = Array.from({ length: 25 }, (_, i) => `artist-${i}`);
    const availableByArtist = new Map(artistIds.map((id) => [id, 50] as const));

    const allocation = strategy.allocate({
      artistIds,
      songsPerArtist: 30,
      availableByArtist,
    });

    expect(sum(allocation)).toBe(MAX_TRACKS);
    for (const artistId of artistIds) {
      expect(allocation.get(artistId)).toBe(8);
    }
  });

  it('takes all available when an artist has fewer than requested', () => {
    const allocation = strategy.allocate({
      artistIds: ['a', 'b'],
      songsPerArtist: 10,
      availableByArtist: new Map([
        ['a', 3],
        ['b', 20],
      ]),
    });

    expect(allocation.get('a')).toBe(3);
    expect(allocation.get('b')).toBe(10);
  });

  it('redistributes surplus when prorating and some artists cannot fill quota', () => {
    const allocation = strategy.allocate({
      artistIds: ['a', 'b', 'c'],
      songsPerArtist: 20,
      availableByArtist: new Map([
        ['a', 2],
        ['b', 40],
        ['c', 40],
      ]),
      maxTracks: 30,
    });

    expect(allocation.get('a')).toBe(2);
    expect(allocation.get('b')).toBeGreaterThanOrEqual(10);
    expect(allocation.get('c')).toBeGreaterThanOrEqual(10);
    expect(sum(allocation)).toBe(30);
  });

  it('never allocates more than available tracks', () => {
    const allocation = strategy.allocate({
      artistIds: ['a', 'b'],
      songsPerArtist: 20,
      availableByArtist: new Map([
        ['a', 5],
        ['b', 5],
      ]),
      maxTracks: 500,
    });

    expect(allocation.get('a')).toBe(5);
    expect(allocation.get('b')).toBe(5);
    expect(sum(allocation)).toBe(10);
  });

  it('returns an empty map for no artists', () => {
    const allocation = strategy.allocate({
      artistIds: [],
      songsPerArtist: 10,
      availableByArtist: new Map(),
    });

    expect(allocation.size).toBe(0);
  });
});

function sum(map: Map<string, number>): number {
  return Array.from(map.values()).reduce((a, b) => a + b, 0);
}
