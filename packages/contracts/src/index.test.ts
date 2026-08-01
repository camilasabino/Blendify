import { describe, expect, it } from 'vitest';
import {
  ApiErrorResponseSchema,
  CreateDiscoverRequestSchema,
  CreateMixRequestSchema,
  MAX_ARTISTS,
  PlaylistDetailSchema,
  PlaylistLibraryQuerySchema,
  PlaylistGenerationSchema,
  PlaylistSummarySchema,
} from './index';

describe('playlist contracts', () => {
  it('applies canonical defaults to an artist mix', () => {
    const request = CreateMixRequestSchema.parse({
      kind: 'artist_mix',
      artistIds: ['artist-1'],
      tracksPerSeed: 10,
      popularity: 'balanced',
    });

    expect(request).toMatchObject({
      name: '',
      description: '',
      orderMode: 'random',
      persistToLibrary: true,
    });
  });

  it('rejects removed compatibility fields', () => {
    expect(() =>
      CreateMixRequestSchema.parse({
        kind: 'artist_mix',
        artistIds: ['artist-1'],
        tracksPerSeed: 10,
        popularity: 'balanced',
        shuffle: true,
      }),
    ).toThrow();
  });

  it('enforces the shared artist selection limit', () => {
    const artistIds = Array.from(
      { length: MAX_ARTISTS + 1 },
      (_, index) => `artist-${index}`,
    );

    expect(() =>
      CreateMixRequestSchema.parse({
        kind: 'artist_mix',
        artistIds,
        tracksPerSeed: 1,
        popularity: 'balanced',
      }),
    ).toThrow();
  });

  it('requires the matching seed shape for Discover', () => {
    expect(() =>
      CreateDiscoverRequestSchema.parse({
        kind: 'discover_track',
        trackId: 'track-1',
        targetTrackCount: 30,
        popularity: 'balanced',
      }),
    ).toThrow();
  });

  it('round-trips a versioned generation recipe', () => {
    const recipe = {
      version: 1,
      kind: 'discover_artist',
      targetTrackCount: 30,
      seed: { id: 'artist-1', name: 'Artist' },
      popularity: 'rarities',
      orderMode: 'random',
    };

    expect(PlaylistGenerationSchema.parse(recipe)).toEqual(recipe);
  });

  it('uses one stable API error envelope', () => {
    expect(
      ApiErrorResponseSchema.parse({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        details: { field: 'kind' },
      }),
    ).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('parses library query parameters without accepting arbitrary booleans', () => {
    expect(
      PlaylistLibraryQuerySchema.parse({ sync: 'true', limit: '10' }),
    ).toMatchObject({ sync: true, limit: 10, offset: 0 });
    expect(() =>
      PlaylistLibraryQuerySchema.parse({ sync: 'sometimes' }),
    ).toThrow();
  });

  it('keeps library summaries lightweight and requires detail tracks', () => {
    const summary = {
      id: 'playlist-1',
      name: 'Evening mix',
      description: 'A smooth selection',
      kind: 'artist_mix',
      seeds: [{ type: 'artist', id: 'artist-1', name: 'Sade' }],
      seedCount: 1,
      trackCount: 1,
      totalDurationMs: 250_000,
      spotifyUrl: 'https://open.spotify.com/playlist/playlist-1',
      spotifyId: 'spotify-playlist-1',
      status: 'COMPLETED',
      missingOnSpotify: false,
      imageUrl: null,
      createdAt: '2026-07-31T12:00:00.000Z',
      updatedAt: '2026-07-31T12:00:00.000Z',
    };

    expect(PlaylistSummarySchema.parse(summary)).toEqual(summary);
    expect(() =>
      PlaylistDetailSchema.parse({
        ...summary,
        generation: {
          version: 1,
          kind: 'artist_mix',
          tracksPerSeed: 1,
          seeds: [{ id: 'artist-1', name: 'Sade' }],
          popularity: 'balanced',
          orderMode: 'random',
        },
      }),
    ).toThrow();
  });
});
