import { EquitableAllocationStrategy } from './allocation.strategy';
import { MAX_TRACKS } from '../../constants';

describe('EquitableAllocationStrategy', () => {
  const strategy = new EquitableAllocationStrategy();

  it('allocates the requested tracks per artist when under the cap', () => {
    const allocation = strategy.allocate({
      artistIds: ['a', 'b', 'c'],
      tracksPerSeed: 10,
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
      tracksPerSeed: 30,
      availableByArtist,
    });

    expect(sum(allocation)).toBe(MAX_TRACKS);
    const expected = Math.floor(MAX_TRACKS / artistIds.length);
    for (const artistId of artistIds) {
      expect(allocation.get(artistId)).toBe(expected);
    }
  });

  it('tops up from other artists when one seed underfills', () => {
    const allocation = strategy.allocate({
      artistIds: ['a', 'b'],
      tracksPerSeed: 10,
      availableByArtist: new Map([
        ['a', 3],
        ['b', 20],
      ]),
    });

    expect(allocation.get('a')).toBe(3);
    expect(allocation.get('b')).toBe(17);
    expect(sum(allocation)).toBe(20);
  });

  it('redistributes a full missing seed without an arbitrary loop limit', () => {
    const allocation = strategy.allocate({
      artistIds: ['a', 'b'],
      tracksPerSeed: 10,
      availableByArtist: new Map([
        ['a', 0],
        ['b', 20],
      ]),
    });

    expect(allocation.get('a')).toBe(0);
    expect(allocation.get('b')).toBe(20);
    expect(sum(allocation)).toBe(20);
  });

  it('fills a one-track gap from surplus when near the playlist cap', () => {
    const allocation = strategy.allocate({
      artistIds: ['a', 'b', 'c', 'd', 'e'],
      tracksPerSeed: 10,
      availableByArtist: new Map([
        ['a', 9],
        ['b', 12],
        ['c', 10],
        ['d', 10],
        ['e', 10],
      ]),
    });

    expect(sum(allocation)).toBe(50);
    expect(allocation.get('a')).toBe(9);
    expect(allocation.get('b')).toBe(11);
  });

  it('redistributes surplus when prorating and some artists cannot fill quota', () => {
    const allocation = strategy.allocate({
      artistIds: ['a', 'b', 'c'],
      tracksPerSeed: 20,
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
      tracksPerSeed: 20,
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

  it('treats an artist missing from the availability map as having zero tracks (no prorate)', () => {
    const allocation = strategy.allocate({
      artistIds: ['a', 'ghost'],
      tracksPerSeed: 10,
      availableByArtist: new Map([['a', 20]]),
    });

    expect(allocation.get('ghost')).toBe(0);
    // Redistribution tops 'a' up with the quota 'ghost' cannot use.
    expect(allocation.get('a')).toBe(20);
  });

  it('treats an artist missing from the availability map as having zero tracks (prorated)', () => {
    const artistIds = Array.from({ length: 25 }, (_, i) => `artist-${i}`);
    const availableByArtist = new Map(
      artistIds.slice(1).map((id) => [id, 50] as const),
    );

    const allocation = strategy.allocate({
      artistIds,
      tracksPerSeed: 30,
      availableByArtist,
    });

    expect(allocation.get('artist-0')).toBe(0);
  });

  it('returns an empty map for no artists', () => {
    const allocation = strategy.allocate({
      artistIds: [],
      tracksPerSeed: 10,
      availableByArtist: new Map(),
    });

    expect(allocation.size).toBe(0);
  });
});

function sum(map: Map<string, number>): number {
  return Array.from(map.values()).reduce((a, b) => a + b, 0);
}
