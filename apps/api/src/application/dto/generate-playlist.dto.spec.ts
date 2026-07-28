import { MixMode } from '../../domain/genre/mix-mode';
import {
  GeneratePlaylistSchema,
  RenamePlaylistSchema,
  assertRequestedTrackBudget,
} from './generate-playlist.dto';

describe('GeneratePlaylistSchema', () => {
  it('accepts a minimal valid payload and applies defaults', () => {
    const parsed = GeneratePlaylistSchema.parse({
      userId: 'user-1',
      artistIds: ['a1'],
    });

    expect(parsed.songsPerArtist).toBe(10);
    expect(parsed.mixMode).toBe(MixMode.BALANCED);
    expect(parsed.shuffle).toBe(true);
    expect(parsed.isPublic).toBe(false);
  });

  it('accepts client artist snapshots', () => {
    const parsed = GeneratePlaylistSchema.parse({
      userId: 'user-1',
      artistIds: ['a1'],
      artists: [{ id: 'a1', name: 'Sade', imageUrl: null }],
    });
    expect(parsed.artists?.[0]?.name).toBe('Sade');
  });

  it('rejects empty artistIds', () => {
    expect(() =>
      GeneratePlaylistSchema.parse({ userId: 'u', artistIds: [] }),
    ).toThrow();
  });
});

describe('RenamePlaylistSchema', () => {
  it('requires a non-empty name', () => {
    expect(() =>
      RenamePlaylistSchema.parse({
        playlistId: 'p1',
        userId: 'u1',
        name: '',
      }),
    ).toThrow();
  });
});

describe('assertRequestedTrackBudget', () => {
  it('allows budgets within the hard cap', () => {
    expect(() => assertRequestedTrackBudget(10, 10)).not.toThrow();
  });

  it('rejects budgets over the hard cap', () => {
    expect(() => assertRequestedTrackBudget(25, 20)).toThrow(/200/);
  });
});
