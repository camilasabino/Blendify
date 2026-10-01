import { describe, expect, it } from 'vitest';
import {
  MUSIC_REGIONS,
  MUSIC_REGION_NAMES,
  SELECTION_FILTER_SUPPORT,
  SelectionFiltersSchema,
  activeSelectionFilters,
  emptySelectionFilters,
  supportedSelectionFilters,
  supportsSelectionFilter,
  supportsAnySelectionFilter,
  PlaylistPublishIncompleteDetailsSchema,
  SpotifyFailureDetailsSchema,
  SpotifyThrottleDetailsSchema,
  ApiErrorResponseSchema,
  ArtistSchema,
  CreateDiscoverRequestSchema,
  CreateTransferRequestSchema,
  CreateMixRequestSchema,
  GenerateDiscoverRequestSchema,
  GenerateMixRequestSchema,
  DiscoverArtistRequestSchema,
  DiscoverTrackRequestSchema,
  DiscoverTrackTargetSchema,
  GeneratedPlaylistSchema,
  GeneratedPlaylistStreamEventSchema,
  GenerationStreamEventSchema,
  DeletePlaylistQuerySchema,
  LibrarySyncResultSchema,
  MAX_ARTISTS,
  MAX_TRACKS,
  MIN_DISCOVER_TRACKS,
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
      filters: {
        region: null,
        femaleVocals: false,
        releaseRange: null,
        excludeLive: false,
      },
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

  it('parses library query parameters with numeric coercion', () => {
    expect(
      PlaylistLibraryQuerySchema.parse({ limit: '10' }),
    ).toMatchObject({ limit: 10, offset: 0 });
  });

  it('rejects arbitrary booleans on query boolean fields', () => {
    expect(() =>
      DeletePlaylistQuerySchema.parse({ fromSpotify: 'sometimes' }),
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

describe('artist contracts', () => {
  it('carries the optional Spotify artist URL', () => {
    const artist = {
      id: 'artist-1',
      name: 'Sade',
      imageUrl: 'https://i.scdn.co/image/sade',
      externalUrl: 'https://open.spotify.com/artist/artist-1',
    };

    expect(ArtistSchema.parse(artist)).toEqual(artist);
    expect(
      ArtistSchema.parse({ id: 'artist-1', name: 'Sade', imageUrl: null }),
    ).not.toHaveProperty('externalUrl');
    expect(
      ArtistSchema.safeParse({ ...artist, externalUrl: '' }).success,
    ).toBe(false);
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

  it('keeps 73, a real zero, and an unknown score distinct', () => {
    expect(TrackSchema.parse({ ...legacyTrack, popularity: 73 }).popularity).toBe(
      73,
    );
    expect(TrackSchema.parse(legacyTrack).popularity).toBe(0);
    expect(
      TrackSchema.parse({ ...legacyTrack, popularity: null }).popularity,
    ).toBeNull();
    expect(
      TrackSchema.safeParse({ ...legacyTrack, popularity: undefined }).success,
    ).toBe(false);
  });

  it('accepts an omitted, null, zero, or measured popularity on a track seed', () => {
    const seed = {
      id: legacyTrack.id,
      name: legacyTrack.name,
      artistId: legacyTrack.artistId,
      artistName: legacyTrack.artistName,
    };

    expect(TrackSeedSchema.parse(seed)).not.toHaveProperty('popularity');
    expect(TrackSeedSchema.parse({ ...seed, popularity: null }).popularity).toBe(
      null,
    );
    expect(TrackSeedSchema.parse({ ...seed, popularity: 0 }).popularity).toBe(0);
    expect(TrackSeedSchema.parse({ ...seed, popularity: 73 }).popularity).toBe(
      73,
    );
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

describe('selection filter contracts', () => {
  const genreMix = {
    kind: 'genre_mix',
    genreIds: ['rock', 'alternative rock'],
    tracksPerSeed: 10,
    popularity: 'balanced',
  };
  const discoverArtist = {
    kind: 'discover_artist',
    artistId: 'radiohead',
    targetTrackCount: 10,
    popularity: 'balanced',
  };
  const discoverTrack = {
    kind: 'discover_track',
    trackId: 'creep',
    track: {
      id: 'creep',
      name: 'Creep',
      artistId: 'radiohead',
      artistName: 'Radiohead',
    },
    targetTrackCount: 10,
    popularity: 'balanced',
  };
  const recipe = {
    version: 1,
    kind: 'genre_mix',
    tracksPerSeed: 10,
    seeds: [{ id: 'rock', name: 'Rock' }],
    popularity: 'balanced',
    orderMode: 'random',
  };

  it('keeps the curated canonical regions unchanged', () => {
    expect(MUSIC_REGIONS).toEqual([
      'latin',
      'american',
      'british',
      'argentina',
      'brazilian',
      'uruguay',
      'colombia',
      'mexico',
      'chile',
      'peru',
      'venezuela',
      'spanish',
    ]);
    expect(Object.keys(MUSIC_REGION_NAMES)).toEqual([...MUSIC_REGIONS]);
  });

  it('defaults every filter to inactive', () => {
    const empty = emptySelectionFilters();

    expect(empty).toEqual({
      region: null,
      femaleVocals: false,
      releaseRange: null,
      excludeLive: false,
    });
    expect(SelectionFiltersSchema.parse({})).toEqual(empty);
    expect(GenerateMixRequestSchema.parse(genreMix)).toMatchObject({
      filters: empty,
    });
    expect(GenerateDiscoverRequestSchema.parse(discoverArtist)).toMatchObject(
      { filters: empty },
    );
    expect(PlaylistGenerationSchema.parse(recipe)).toMatchObject({
      filters: empty,
    });
  });

  it('normalizes region-only recipes to the current filter shape', () => {
    expect(
      PlaylistGenerationSchema.parse({
        ...recipe,
        filters: { region: 'argentina' },
      }),
    ).toMatchObject({
      filters: {
        region: 'argentina',
        femaleVocals: false,
        releaseRange: null,
        excludeLive: false,
      },
    });
  });

  it('supports artist-level filters only where Blendify discovers the artists', () => {
    expect(SELECTION_FILTER_SUPPORT).toEqual({
      artist_mix: {
        region: false,
        femaleVocals: false,
        releaseRange: true,
        excludeLive: true,
      },
      genre_mix: {
        region: true,
        femaleVocals: true,
        releaseRange: true,
        excludeLive: true,
      },
      discover_artist: {
        region: true,
        femaleVocals: true,
        releaseRange: true,
        excludeLive: true,
      },
      discover_track: {
        region: true,
        femaleVocals: true,
        releaseRange: true,
        excludeLive: true,
      },
    });
    expect(supportsSelectionFilter('artist_mix', 'region')).toBe(false);
    expect(supportsSelectionFilter('artist_mix', 'femaleVocals')).toBe(false);
    expect(supportsSelectionFilter('artist_mix', 'releaseRange')).toBe(true);
    expect(supportsSelectionFilter('discover_track', 'region')).toBe(true);
    expect(supportsAnySelectionFilter('artist_mix')).toBe(true);
    expect(supportsAnySelectionFilter('genre_mix')).toBe(true);
  });

  it('lists active filters and drops unsupported ones for a kind', () => {
    const filters = {
      region: 'argentina' as const,
      femaleVocals: true,
      releaseRange: { fromYear: 1990, toYear: 1999 },
      excludeLive: true,
    };

    expect(activeSelectionFilters(emptySelectionFilters())).toEqual([]);
    expect(activeSelectionFilters(filters)).toEqual([
      'region',
      'femaleVocals',
      'releaseRange',
      'excludeLive',
    ]);
    expect(supportedSelectionFilters('artist_mix', filters)).toEqual({
      region: null,
      femaleVocals: false,
      releaseRange: { fromYear: 1990, toYear: 1999 },
      excludeLive: true,
    });
    expect(supportedSelectionFilters('genre_mix', filters)).toEqual(filters);
  });

  it('carries every filter in genre mix and discover requests', () => {
    const filters = {
      region: 'argentina',
      femaleVocals: true,
      releaseRange: { fromYear: 1990, toYear: 1999 },
      excludeLive: true,
    };

    expect(
      GenerateMixRequestSchema.parse({ ...genreMix, filters }),
    ).toMatchObject({ filters });
    expect(
      GenerateDiscoverRequestSchema.parse({ ...discoverArtist, filters }),
    ).toMatchObject({ filters });
    expect(
      GenerateDiscoverRequestSchema.parse({ ...discoverTrack, filters }),
    ).toMatchObject({ filters });
  });

  it.each([
    [{ fromYear: 1990, toYear: 1999 }],
    [{ fromYear: 2015 }],
    [{ toYear: 1999 }],
    [{ fromYear: 1995, toYear: 1995 }],
  ])('accepts the release range %p', (releaseRange) => {
    expect(
      GenerateMixRequestSchema.parse({
        ...genreMix,
        filters: { releaseRange },
      }).filters.releaseRange,
    ).toEqual(releaseRange);
  });

  it.each([
    ['an empty range', {}],
    ['a reversed range', { fromYear: 1999, toYear: 1990 }],
    ['a fractional year', { fromYear: 1990.5 }],
    ['a string year', { fromYear: '1990' }],
    ['a year before the supported bounds', { fromYear: 1800 }],
    ['a year after the supported bounds', { toYear: 3000 }],
    ['a decade field', { decade: 1990 }],
  ])('rejects %s', (_label, releaseRange) => {
    expect(
      GenerateMixRequestSchema.safeParse({
        ...genreMix,
        filters: { releaseRange },
      }).success,
    ).toBe(false);
  });

  it('rejects non-boolean vocal and live filters', () => {
    expect(
      GenerateMixRequestSchema.safeParse({
        ...genreMix,
        filters: { femaleVocals: 'yes' },
      }).success,
    ).toBe(false);
    expect(
      GenerateMixRequestSchema.safeParse({
        ...genreMix,
        filters: { excludeLive: 1 },
      }).success,
    ).toBe(false);
  });

  it('carries one canonical region in genre mix and discover requests', () => {
    const filters = { region: 'argentina' };

    expect(
      GenerateMixRequestSchema.parse({ ...genreMix, filters }),
    ).toMatchObject({ filters });
    expect(
      GenerateDiscoverRequestSchema.parse({ ...discoverArtist, filters }),
    ).toMatchObject({ filters });
    expect(
      GenerateDiscoverRequestSchema.parse({ ...discoverTrack, filters }),
    ).toMatchObject({ filters });
    expect(
      PlaylistGenerationSchema.parse({
        ...recipe,
        filters: { region: 'brazilian' },
      }),
    ).toMatchObject({ filters: { region: 'brazilian' } });
  });

  it.each(['Argentina', 'argentinian rock', ['latin', 'british']])(
    'rejects %p as a region',
    (region) => {
      expect(
        GenerateMixRequestSchema.safeParse({ ...genreMix, filters: { region } })
          .success,
      ).toBe(false);
      expect(
        GenerateDiscoverRequestSchema.safeParse({
          ...discoverArtist,
          filters: { region },
        }).success,
      ).toBe(false);
    },
  );

  it('rejects unknown filters and the former top-level region field', () => {
    expect(
      GenerateMixRequestSchema.safeParse({
        ...genreMix,
        filters: { region: 'latin', mood: 'calm' },
      }).success,
    ).toBe(false);
    expect(
      GenerateMixRequestSchema.safeParse({ ...genreMix, region: 'latin' })
        .success,
    ).toBe(false);
  });

  it('rejects artist-level filters on artist mixes', () => {
    const artistMix = {
      kind: 'artist_mix',
      artistIds: ['artist-1'],
      tracksPerSeed: 10,
      popularity: 'balanced',
    };

    expect(
      GenerateMixRequestSchema.safeParse({
        ...artistMix,
        filters: { region: 'latin' },
      }).success,
    ).toBe(false);
    expect(
      GenerateMixRequestSchema.safeParse({
        ...artistMix,
        filters: { femaleVocals: true },
      }).success,
    ).toBe(false);
    expect(
      GenerateMixRequestSchema.safeParse({ ...artistMix, region: 'latin' })
        .success,
    ).toBe(false);
  });

  it('accepts track-level filters on artist mixes', () => {
    const filters = {
      region: null,
      femaleVocals: false,
      releaseRange: { fromYear: 1980, toYear: 1989 },
      excludeLive: true,
    };

    expect(
      GenerateMixRequestSchema.parse({
        kind: 'artist_mix',
        artistIds: ['artist-1'],
        tracksPerSeed: 10,
        popularity: 'balanced',
        filters,
      }),
    ).toMatchObject({ filters });
  });

  it('normalizes legacy artist mix recipes to inactive filters', () => {
    const parsed = PlaylistGenerationSchema.parse({
      version: 1,
      kind: 'artist_mix',
      tracksPerSeed: 10,
      seeds: [{ id: 'artist-1', name: 'Radiohead' }],
      popularity: 'balanced',
    });

    expect(parsed).toMatchObject({ filters: emptySelectionFilters() });
    expect(
      PlaylistGenerationSchema.safeParse({
        ...parsed,
        filters: { femaleVocals: true },
      }).success,
    ).toBe(false);
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
      filters: {
        region: null,
        femaleVocals: false,
        releaseRange: null,
        excludeLive: false,
      },
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
        releaseDate: '1984-07-16',
        releaseDatePrecision: 'day',
      },
    ],
    coverArtwork: {
      imageUrl: 'https://i.scdn.co/image/cover',
      spotifyUrl: 'https://open.spotify.com/track/track-1',
    },
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

  it('never exposes cover artwork without its Spotify link', () => {
    const { coverArtwork, ...withoutArtwork } = generated;

    expect(GeneratedPlaylistSchema.parse(withoutArtwork)).toEqual(
      withoutArtwork,
    );
    expect(
      GeneratedPlaylistSchema.safeParse({
        ...generated,
        coverArtwork: { imageUrl: coverArtwork.imageUrl },
      }).success,
    ).toBe(false);
    expect(
      GeneratedPlaylistSchema.parse({
        ...withoutArtwork,
        coverCandidateUrl: 'https://images.example/cover.jpg',
      }),
    ).not.toHaveProperty('coverCandidateUrl');
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

  it('requires checkedCount and removedCount on a library sync result', () => {
    expect(() =>
      LibrarySyncResultSchema.parse({ checkedCount: 5 }),
    ).toThrow();
    expect(
      LibrarySyncResultSchema.parse({ checkedCount: 5, removedCount: 2 }),
    ).toEqual({ checkedCount: 5, removedCount: 2 });
  });
});

describe('discover track targets', () => {
  const targets = Array.from(
    { length: MAX_TRACKS - MIN_DISCOVER_TRACKS + 1 },
    (_, index) => MIN_DISCOVER_TRACKS + index,
  );
  const discoverTrack = {
    id: 'track-1',
    name: 'Stay',
    artistId: 'artist-1',
    artistName: 'Sade',
  };

  it.each(targets)('accepts discover target %s for both request kinds', (target) => {
    expect(DiscoverTrackTargetSchema.parse(target)).toBe(target);
    expect(
      DiscoverArtistRequestSchema.parse({
        kind: 'discover_artist',
        artistId: 'artist-1',
        targetTrackCount: target,
        popularity: 'balanced',
      }).targetTrackCount,
    ).toBe(target);
    expect(
      DiscoverTrackRequestSchema.parse({
        kind: 'discover_track',
        trackId: 'track-1',
        track: discoverTrack,
        targetTrackCount: target,
        popularity: 'balanced',
      }).targetTrackCount,
    ).toBe(target);
  });

  it.each([0, -1, 51, 1.5, '1', null])(
    'rejects discover target %j',
    (target) => {
      expect(DiscoverTrackTargetSchema.safeParse(target).success).toBe(false);
      expect(
        DiscoverArtistRequestSchema.safeParse({
          kind: 'discover_artist',
          artistId: 'artist-1',
          targetTrackCount: target,
          popularity: 'balanced',
        }).success,
      ).toBe(false);
      expect(
        DiscoverTrackRequestSchema.safeParse({
          kind: 'discover_track',
          trackId: 'track-1',
          track: discoverTrack,
          targetTrackCount: target,
          popularity: 'balanced',
        }).success,
      ).toBe(false);
    },
  );

  it('rejects a discover request that omits the target', () => {
    expect(
      DiscoverArtistRequestSchema.safeParse({
        kind: 'discover_artist',
        artistId: 'artist-1',
        popularity: 'balanced',
      }).success,
    ).toBe(false);
    expect(
      DiscoverTrackRequestSchema.safeParse({
        kind: 'discover_track',
        trackId: 'track-1',
        track: discoverTrack,
        popularity: 'balanced',
      }).success,
    ).toBe(false);
  });

  it('round-trips preset and intermediate discover recipes', () => {
    for (const targetTrackCount of [1, 15, 23, 30, 31, 50]) {
      const artistRecipe = {
        version: 1 as const,
        kind: 'discover_artist' as const,
        targetTrackCount,
        seed: { id: 'artist-1', name: 'Sade' },
        filters: {
          region: null,
          femaleVocals: false,
          releaseRange: null,
          excludeLive: false,
        },
        popularity: 'balanced' as const,
        orderMode: 'random' as const,
      };
      const trackRecipe = {
        version: 1 as const,
        kind: 'discover_track' as const,
        targetTrackCount,
        seed: discoverTrack,
        filters: {
          region: 'argentina' as const,
          femaleVocals: true,
          releaseRange: { toYear: 1999 },
          excludeLive: true,
        },
        popularity: 'balanced' as const,
        orderMode: 'random' as const,
      };
      expect(PlaylistGenerationSchema.parse(artistRecipe)).toEqual(artistRecipe);
      expect(PlaylistGenerationSchema.parse(trackRecipe)).toEqual(trackRecipe);
      expect(
        GeneratedPlaylistSchema.parse({
          name: 'Blendify · Discover · Sade',
          description: 'In the orbit of Sade.',
          generation: artistRecipe,
          seeds: [{ type: 'artist', id: 'artist-1', name: 'Sade' }],
          tracks: [],
          transfer: null,
        }).generation,
      ).toEqual(artistRecipe);
    }
  });
});

describe('Spotify provider failure contracts', () => {
  it('describes an incomplete publication with its created playlist', () => {
    expect(
      PlaylistPublishIncompleteDetailsSchema.parse({
        spotifyId: 'created-1',
        spotifyUrl: 'https://open.spotify.com/playlist/created-1',
        failedStep: 'add_tracks',
        tracksAdded: 'unknown',
      }),
    ).toMatchObject({ failedStep: 'add_tracks', tracksAdded: 'unknown' });
    expect(
      PlaylistPublishIncompleteDetailsSchema.safeParse({
        spotifyId: '',
        spotifyUrl: null,
        failedStep: 'upload_cover',
        tracksAdded: 'none',
      }).success,
    ).toBe(false);
  });

  it('keeps the provider wait source separate from the wait itself', () => {
    expect(
      SpotifyThrottleDetailsSchema.parse({
        retryAfterSeconds: 20,
        retryAfterSource: 'blendify',
        reason: 'rate_limit',
      }).retryAfterSource,
    ).toBe('blendify');
    expect(
      SpotifyThrottleDetailsSchema.safeParse({
        retryAfterSeconds: 0,
        retryAfterSource: 'spotify',
        reason: 'rate_limit',
      }).success,
    ).toBe(false);
  });

  it('accepts operation, category and status without provider payloads', () => {
    expect(
      SpotifyFailureDetailsSchema.parse({
        operation: 'createPlaylist',
        category: 'upstream_error',
        status: 502,
        body: { secret: 'dropped' },
      }),
    ).toEqual({ operation: 'createPlaylist', category: 'upstream_error', status: 502 });
  });

  it('keeps a transient Spotify failure wait attributed to Spotify only', () => {
    const base = { operation: 'searchArtists', category: 'upstream_error', status: 503 };

    expect(
      SpotifyFailureDetailsSchema.parse({ ...base, retryAfterSeconds: 30, retryAfterSource: 'spotify' }),
    ).toEqual({ ...base, retryAfterSeconds: 30, retryAfterSource: 'spotify' });
    expect(
      SpotifyFailureDetailsSchema.safeParse({ ...base, retryAfterSeconds: 30, retryAfterSource: 'blendify' })
        .success,
    ).toBe(false);
    expect(SpotifyFailureDetailsSchema.safeParse({ ...base, retryAfterSeconds: 0 }).success).toBe(false);
  });

  it('carries a cover upload failure on a published playlist stream result', () => {
    const parsed = GenerationStreamEventSchema.parse({
      type: 'result',
      playlist: {
        id: 'playlist-1',
        name: 'Mix',
        description: '',
        kind: 'artist_mix',
        seeds: [{ type: 'artist', id: 'artist-1', name: 'Sade' }],
        seedCount: 1,
        trackCount: 0,
        totalDurationMs: 0,
        spotifyUrl: 'https://open.spotify.com/playlist/spotify-1',
        spotifyId: 'spotify-1',
        status: 'COMPLETED',
        imageUrl: null,
        createdAt: '2026-09-30T12:00:00.000Z',
        updatedAt: '2026-09-30T12:00:00.000Z',
        tracks: [],
        generation: {
          version: 1,
          kind: 'artist_mix',
          tracksPerSeed: 1,
          seeds: [{ id: 'artist-1', name: 'Sade' }],
          popularity: 'balanced',
          orderMode: 'random',
        },
        coverUploadFailed: true,
      },
    });
    expect(parsed.type === 'result' && parsed.playlist.coverUploadFailed).toBe(true);
  });
});
