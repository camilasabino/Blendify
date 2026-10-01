import type { AiIntent } from './ai-intent';
import { diffIntents, diffPlaylistTracks } from './ai-refinement-diff';

function tracks(...ids: string[]) {
  return ids.map((id, index) => ({ id, durationMs: 60_000 * (index + 1) }));
}

function intent(overrides: Partial<AiIntent> = {}): AiIntent {
  return {
    kind: 'artist_mix',
    artists: ['Radiohead', 'Interpol'],
    genres: [],
    seedTracks: [],
    filters: { region: null },
    targetTrackCount: 30,
    targetDurationMinutes: null,
    mood: 'calm',
    popularity: 'balanced',
    orderMode: null,
    excludeArtists: [],
    excludeTracks: [],
    unsupportedConstraints: [],
    ...overrides,
  };
}

describe('diffPlaylistTracks', () => {
  it('reports nothing for identical playlists', () => {
    const diff = diffPlaylistTracks(
      tracks('a', 'b', 'c'),
      tracks('a', 'b', 'c'),
    );

    expect(diff).toEqual({
      added: [],
      removed: [],
      moved: [],
      retainedCount: 3,
      replacedCount: 0,
      before: { trackCount: 3, durationMs: 360_000 },
      after: { trackCount: 3, durationMs: 360_000 },
    });
  });

  it('detects a removed track once, without counting the shift as movement', () => {
    const diff = diffPlaylistTracks(
      tracks('a', 'b', 'c', 'd'),
      tracks('a', 'c', 'd'),
    );

    expect(diff.removed).toEqual([{ trackId: 'b', position: 2 }]);
    expect(diff.added).toEqual([]);
    expect(diff.moved).toEqual([]);
    expect(diff.retainedCount).toBe(3);
  });

  it('detects an added track once', () => {
    const diff = diffPlaylistTracks(tracks('a', 'b'), tracks('a', 'x', 'b'));

    expect(diff.added).toEqual([{ trackId: 'x', position: 2 }]);
    expect(diff.removed).toEqual([]);
    expect(diff.moved).toEqual([]);
  });

  it('reports a moved track as movement, not as a replacement', () => {
    const diff = diffPlaylistTracks(
      tracks('a', 'b', 'c', 'd'),
      tracks('a', 'c', 'd', 'b'),
    );

    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.moved).toEqual([{ trackId: 'b', from: 2, to: 4 }]);
    expect(diff.replacedCount).toBe(0);
    expect(diff.retainedCount).toBe(4);
  });

  it('keeps a preserved track at its position out of the change lists', () => {
    const diff = diffPlaylistTracks(
      tracks('a', 'b', 'c'),
      tracks('a', 'x', 'y'),
    );

    expect(diff.moved).toEqual([]);
    expect(diff.added.map((entry) => entry.trackId)).toEqual(['x', 'y']);
    expect(diff.removed.map((entry) => entry.trackId)).toEqual(['b', 'c']);
  });

  it('keeps the counts mathematically consistent', () => {
    const current = tracks('a', 'b', 'c', 'd', 'e');
    const candidate = tracks('e', 'x', 'a', 'y', 'z', 'c');

    const diff = diffPlaylistTracks(current, candidate);

    expect(diff.before.trackCount).toBe(
      diff.retainedCount + diff.removed.length,
    );
    expect(diff.after.trackCount).toBe(diff.retainedCount + diff.added.length);
    expect(diff.replacedCount).toBe(
      Math.min(diff.added.length, diff.removed.length),
    );
    expect(diff.moved.length).toBeLessThanOrEqual(diff.retainedCount);
  });

  it('orders every list deterministically by position', () => {
    const current = tracks('a', 'b', 'c', 'd', 'e');
    const candidate = tracks('e', 'd', 'c', 'x', 'b', 'a');

    const first = diffPlaylistTracks(current, candidate);
    const second = diffPlaylistTracks(current, candidate);

    expect(first).toEqual(second);
    expect(first.moved.map((entry) => entry.to)).toEqual(
      [...first.moved.map((entry) => entry.to)].sort((l, r) => l - r),
    );
    expect(first.moved).toHaveLength(4);
  });

  it('never mutates either playlist', () => {
    const current = tracks('a', 'b', 'c');
    const candidate = tracks('c', 'a', 'x');
    const snapshot = structuredClone({ current, candidate });

    diffPlaylistTracks(current, candidate);

    expect({ current, candidate }).toEqual(snapshot);
  });
});

describe('diffIntents', () => {
  it('reports no change for the same intent', () => {
    expect(diffIntents(intent(), intent())).toEqual([]);
  });

  it('reports structured scalar changes in a fixed field order', () => {
    expect(
      diffIntents(
        intent(),
        intent({
          popularity: 'rarities',
          targetTrackCount: 20,
          mood: null,
          orderMode: 'artist',
        }),
      ),
    ).toEqual([
      { field: 'targetTrackCount', from: 30, to: 20 },
      { field: 'mood', from: 'calm', to: null },
      { field: 'popularity', from: 'balanced', to: 'rarities' },
      { field: 'orderMode', from: null, to: 'artist' },
    ]);
  });

  it('reports list additions and removals with canonical genre names', () => {
    expect(
      diffIntents(
        intent({ kind: 'genre_mix', artists: [], genres: ['indie rock'] }),
        intent({
          kind: 'genre_mix',
          artists: [],
          genres: ['argentine rock'],
          excludeArtists: ['Coldplay'],
          excludeTracks: [{ title: 'Yellow', artist: 'Coldplay' }],
        }),
      ),
    ).toEqual([
      { field: 'genres', added: ['Rock'], removed: ['Indie Rock'] },
      { field: 'region', from: null, to: 'argentina' },
      { field: 'excludeArtists', added: ['Coldplay'], removed: [] },
      {
        field: 'excludeTracks',
        added: [{ title: 'Yellow', artist: 'Coldplay' }],
        removed: [],
      },
    ]);
  });

  it('reports a region change even when the canonical genres stay the same', () => {
    expect(
      diffIntents(
        intent({ kind: 'genre_mix', artists: [], genres: ['rock argentino'] }),
        intent({ kind: 'genre_mix', artists: [], genres: ['rock británico'] }),
      ),
    ).toEqual([{ field: 'region', from: 'argentina', to: 'british' }]);
  });

  it('ignores case-only artist rewrites and reports kind and seed changes', () => {
    expect(
      diffIntents(
        intent(),
        intent({
          kind: 'discover_track',
          artists: [],
          seedTracks: [{ title: 'Teardrop', artist: 'Massive Attack' }],
          filters: { region: null },
        }),
      ),
    ).toEqual([
      { field: 'kind', from: 'artist_mix', to: 'discover_track' },
      { field: 'artists', added: [], removed: ['Radiohead', 'Interpol'] },
      {
        field: 'seedTracks',
        added: [{ title: 'Teardrop', artist: 'Massive Attack' }],
        removed: [],
      },
    ]);
    expect(
      diffIntents(intent(), intent({ artists: ['radiohead', 'INTERPOL'] })),
    ).toEqual([]);
  });
});
