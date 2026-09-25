import { describe, expect, it } from 'vitest';
import {
  ApiErrorResponseSchema,
  CreateDiscoverRequestSchema,
  CreateTransferRequestSchema,
  CreateMixRequestSchema,
  GenerateDiscoverRequestSchema,
  GenerateMixRequestSchema,
  GeneratedPlaylistSchema,
  GeneratedPlaylistStreamEventSchema,
  GenerationStreamEventSchema,
  MAX_ARTISTS,
  PlaylistDetailSchema,
  PlaylistLibraryQuerySchema,
  PlaylistGenerationSchema,
  PlaylistSummarySchema,
  PlaylistTransferSchema,
  TRANSFER_TOKEN_MAX_LENGTH,
  TrackSchema,
  TrackSeedSchema,
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

describe('track contracts', () => {
  const legacyTrack = {
    id: 'track-1',
    name: 'Stay',
    artistId: 'kid-id',
    artistName: 'The Kid LAROI',
    durationMs: 141_000,
    popularity: 0,
    uri: 'spotify:track:track-1',
  };

  it('accepts a track without portable metadata', () => {
    expect(TrackSchema.parse(legacyTrack)).toEqual(legacyTrack);
  });

  it('accepts credited artists, isrc and external url', () => {
    const track = {
      ...legacyTrack,
      artists: [
        { id: 'kid-id', name: 'The Kid LAROI' },
        { name: 'Uncredited Id' },
      ],
      isrc: 'USUM72105936',
      externalUrl: 'https://open.spotify.com/track/track-1',
    };

    expect(TrackSchema.parse(track)).toEqual(track);
  });

  it('rejects malformed credited artists', () => {
    expect(() =>
      TrackSchema.parse({ ...legacyTrack, artists: [{ id: 'x' }] }),
    ).toThrow();
    expect(() =>
      TrackSchema.parse({ ...legacyTrack, artists: [{ name: '' }] }),
    ).toThrow();
    expect(() =>
      TrackSchema.parse({ ...legacyTrack, artists: 'The Kid LAROI' }),
    ).toThrow();
  });

  it('keeps portable metadata out of track seeds', () => {
    const seed = TrackSeedSchema.parse({
      ...legacyTrack,
      artists: [{ id: 'kid-id', name: 'The Kid LAROI' }],
      isrc: 'USUM72105936',
      externalUrl: 'https://open.spotify.com/track/track-1',
    });

    expect(seed).not.toHaveProperty('artists');
    expect(seed).not.toHaveProperty('isrc');
    expect(seed).not.toHaveProperty('externalUrl');
  });
});

describe('guest generation contracts', () => {
  const artistMix = {
    kind: 'artist_mix',
    artistIds: ['artist-1'],
    tracksPerSeed: 10,
    popularity: 'balanced',
  };
  const genreMix = {
    kind: 'genre_mix',
    genreIds: ['jazz'],
    tracksPerSeed: 10,
    popularity: 'balanced',
  };
  const discoverArtist = {
    kind: 'discover_artist',
    artistId: 'artist-1',
    targetTrackCount: 15,
    popularity: 'balanced',
  };
  const discoverTrack = {
    kind: 'discover_track',
    trackId: 'track-1',
    track: {
      id: 'track-1',
      name: 'Stay',
      artistId: 'kid-id',
      artistName: 'The Kid LAROI',
    },
    targetTrackCount: 15,
    popularity: 'balanced',
  };
  const cases = [
    { schema: GenerateMixRequestSchema, body: artistMix },
    { schema: GenerateMixRequestSchema, body: genreMix },
    { schema: GenerateDiscoverRequestSchema, body: discoverArtist },
    { schema: GenerateDiscoverRequestSchema, body: discoverTrack },
  ];

  it.each(cases)('accepts the $body.kind generation inputs', ({ schema, body }) => {
    const parsed = schema.parse(body);

    expect(parsed).toMatchObject({
      ...body,
      name: '',
      description: '',
      orderMode: 'random',
    });
    expect(parsed).not.toHaveProperty('persistToLibrary');
    expect(parsed).not.toHaveProperty('coverImageBase64');
  });

  it.each(
    cases.flatMap(({ schema, body }) =>
      [
        { coverImageBase64: 'aGVsbG8=' },
        { persistToLibrary: false },
        { market: 'US' },
        { maxTracks: 10 },
        { displaySeeds: [] },
        { generation: {} },
      ].map((extra) => ({
        schema,
        body,
        field: Object.keys(extra)[0],
        extra,
      })),
    ),
  )('rejects $field on $body.kind', ({ schema, body, extra }) => {
    expect(schema.safeParse({ ...body, ...extra }).success).toBe(false);
  });

  it('keeps Spotify Mode requests accepting publication fields', () => {
    expect(
      CreateMixRequestSchema.parse({
        ...artistMix,
        coverImageBase64: 'aGVsbG8=',
        persistToLibrary: false,
      }),
    ).toMatchObject({ coverImageBase64: 'aGVsbG8=', persistToLibrary: false });
  });

  const generated = {
    name: 'Blendify · Mix · Sade',
    description: 'Made with Blendify from Sade.',
    generation: {
      version: 1,
      kind: 'artist_mix',
      tracksPerSeed: 1,
      seeds: [{ id: 'artist-1', name: 'Sade' }],
      popularity: 'balanced',
      orderMode: 'random',
    },
    seeds: [{ type: 'artist', id: 'artist-1', name: 'Sade' }],
    tracks: [
      {
        id: 'track-1',
        name: 'Smooth Operator',
        artistId: 'artist-1',
        artistName: 'Sade',
        durationMs: 250_000,
        popularity: 0,
        uri: 'spotify:track:track-1',
        artists: [{ id: 'artist-1', name: 'Sade' }],
        isrc: 'GBBBM8400012',
        externalUrl: 'https://open.spotify.com/track/track-1',
      },
    ],
    coverCandidateUrl: 'https://images.example/cover.jpg',
    transfer: {
      token: 'signed-transfer-token',
      expiresAt: '2026-09-25T13:00:00.000Z',
    },
  };

  it('round-trips a generated playlist without destination state', () => {
    const parsed = GeneratedPlaylistSchema.parse({
      ...generated,
      id: 'playlist-1',
      spotifyId: 'spotify-1',
      status: 'COMPLETED',
    });

    expect(parsed).toEqual(generated);
  });

  it('streams generated playlists with the shared event envelope', () => {
    const result = { type: 'result', playlist: generated };

    expect(GeneratedPlaylistStreamEventSchema.parse(result)).toEqual(result);
    expect(GenerationStreamEventSchema.safeParse(result).success).toBe(false);
    expect(
      GeneratedPlaylistStreamEventSchema.parse({
        type: 'progress',
        phase: 'matching_tracks',
        current: 1,
        total: 2,
        percent: 50,
      }),
    ).toMatchObject({ type: 'progress' });
  });

  it('accepts a generated playlist whose transfer is unavailable', () => {
    const unavailable = { ...generated, transfer: null };

    expect(GeneratedPlaylistSchema.parse(unavailable)).toEqual(unavailable);
    const { transfer: _transfer, ...withoutTransfer } = generated;
    expect(GeneratedPlaylistSchema.safeParse(withoutTransfer).success).toBe(
      false,
    );
  });
});

describe('transfer contracts', () => {
  it('accepts only a transfer token', () => {
    expect(
      CreateTransferRequestSchema.parse({ transferToken: 'token' }),
    ).toEqual({ transferToken: 'token' });

    for (const extra of [
      { tracks: [] },
      { destination: 'spotify' },
      { sourceName: 'Other' },
      { sourceLogo: 'https://evil.example/logo.png' },
      { userId: 'user-1' },
      { accessToken: 'spotify-token' },
    ]) {
      expect(
        CreateTransferRequestSchema.safeParse({
          transferToken: 'token',
          ...extra,
        }).success,
      ).toBe(false);
    }
  });

  it('bounds the transfer token length', () => {
    expect(
      CreateTransferRequestSchema.safeParse({ transferToken: '' }).success,
    ).toBe(false);
    expect(
      CreateTransferRequestSchema.safeParse({
        transferToken: 'x'.repeat(TRANSFER_TOKEN_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it('describes a provider-neutral transfer result', () => {
    const transfer = {
      url: 'https://soundiiz.com/go/import-playlist/abc123',
      expiresAt: '2026-09-26T12:00:00.000Z',
      trackCount: 2,
    };

    expect(PlaylistTransferSchema.parse(transfer)).toEqual(transfer);
    expect(
      PlaylistTransferSchema.safeParse({ ...transfer, trackCount: 0 }).success,
    ).toBe(false);
    expect(
      PlaylistTransferSchema.safeParse({ ...transfer, url: 'not a url' })
        .success,
    ).toBe(false);
  });
});
