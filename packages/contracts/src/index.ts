import { z } from 'zod';

export const MAX_ARTISTS = 12;
export const MAX_GENRES = 5;
export const MAX_TRACKS = 50;
export const TRANSFER_TOKEN_MAX_LENGTH = 48_000;

export const POPULARITY_MODES = ['popular', 'balanced', 'rarities'] as const;
export const TRACK_ORDER_MODES = ['artist', 'title', 'random'] as const;
export const PopularityMode = {
  POPULAR: 'popular',
  BALANCED: 'balanced',
  RARITIES: 'rarities',
} as const;
export const TrackOrderMode = {
  ARTIST: 'artist',
  TITLE: 'title',
  RANDOM: 'random',
} as const;
export const PlaylistStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export const PLAYLIST_KINDS = [
  'artist_mix',
  'genre_mix',
  'discover_artist',
  'discover_track',
] as const;
export const PLAYLIST_STATUSES = ['PENDING', 'COMPLETED', 'FAILED'] as const;
export const DISCOVER_TRACK_TARGETS = [15, 30, 50] as const;
export const BULK_LIBRARY_ACTIONS = ['purge_active', 'clear_library'] as const;

export const PopularityModeSchema = z.enum(POPULARITY_MODES);
export const TrackOrderModeSchema = z.enum(TRACK_ORDER_MODES);
export const PlaylistKindSchema = z.enum(PLAYLIST_KINDS);
export const PlaylistStatusSchema = z.enum(PLAYLIST_STATUSES);
export const DiscoverTrackTargetSchema = z.union([
  z.literal(15),
  z.literal(30),
  z.literal(50),
]);
export const BulkLibraryActionSchema = z.enum(BULK_LIBRARY_ACTIONS);

export type PopularityMode = z.infer<typeof PopularityModeSchema>;
export type TrackOrderMode = z.infer<typeof TrackOrderModeSchema>;
export type PlaylistKind = z.infer<typeof PlaylistKindSchema>;
export type PlaylistStatus = z.infer<typeof PlaylistStatusSchema>;
export type DiscoverTrackTarget = z.infer<typeof DiscoverTrackTargetSchema>;
export type BulkLibraryAction = z.infer<typeof BulkLibraryActionSchema>;

export const ArtistSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  imageUrl: z.string().max(500).nullable().optional(),
  externalUrl: z.string().min(1).max(500).optional(),
});

export const UserSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  email: z.string().nullable(),
  imageUrl: z.string().nullable(),
});
export const AuthSessionSchema = z.object({ user: UserSchema.nullable() });
export const OkResponseSchema = z.object({ ok: z.literal(true) });

export const TrackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  artistId: z.string().min(1),
  artistName: z.string().min(1).max(200),
  durationMs: z.number().int().nonnegative(),
  popularity: z.number().int().min(0).max(100),
  uri: z.string().min(1),
  albumName: z.string().optional(),
  albumImageUrl: z.string().nullable().optional(),
  previewUrl: z.string().nullable().optional(),
  artists: z
    .array(
      z.object({
        id: z.string().min(1).optional(),
        name: z.string().min(1).max(200),
      }),
    )
    .optional(),
  isrc: z.string().min(1).optional(),
  externalUrl: z.string().min(1).optional(),
});

export const TrackSeedSchema = TrackSchema.pick({
  id: true,
  name: true,
  artistId: true,
  artistName: true,
  albumImageUrl: true,
}).extend({
  uri: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  popularity: z.number().int().min(0).max(100).optional(),
});

export const GenreSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  parentId: z.string().nullable().optional(),
});

export const PlaylistSeedSchema = z.discriminatedUnion('type', [
  ArtistSchema.extend({ type: z.literal('artist') }),
  GenreSchema.pick({ id: true, name: true }).extend({
    type: z.literal('genre'),
    imageUrl: z.string().max(500).nullable().optional(),
  }),
  TrackSeedSchema.extend({ type: z.literal('track') }),
]);

export const GenerationSettingsSchema = z.object({
  version: z.literal(1),
  popularity: PopularityModeSchema,
  orderMode: TrackOrderModeSchema.default('random'),
});

export const PlaylistGenerationSchema = z.discriminatedUnion('kind', [
  GenerationSettingsSchema.extend({
    kind: z.literal('artist_mix'),
    tracksPerSeed: z.number().int().min(1).max(MAX_TRACKS),
    // Keep historical generation recipes readable after lowering UI limits.
    seeds: z.array(ArtistSchema).min(1).max(20),
  }),
  GenerationSettingsSchema.extend({
    kind: z.literal('genre_mix'),
    tracksPerSeed: z.number().int().min(1).max(MAX_TRACKS),
    seeds: z
      .array(GenreSchema.pick({ id: true, name: true }))
      .min(1)
      .max(10),
  }),
  GenerationSettingsSchema.extend({
    kind: z.literal('discover_artist'),
    targetTrackCount: DiscoverTrackTargetSchema,
    seed: ArtistSchema,
  }),
  GenerationSettingsSchema.extend({
    kind: z.literal('discover_track'),
    targetTrackCount: DiscoverTrackTargetSchema,
    seed: TrackSeedSchema,
  }),
]);

const PlaylistMetadataSchema = z.object({
  name: z.string().max(100).default(''),
  description: z.string().max(300).default(''),
  coverImageBase64: z.string().min(1).max(400_000).optional(),
  persistToLibrary: z.boolean().default(true),
});

export const ArtistMixRequestSchema = PlaylistMetadataSchema.extend({
  kind: z.literal('artist_mix'),
  artistIds: z.array(z.string().min(1)).min(1).max(MAX_ARTISTS),
  artists: z.array(ArtistSchema).max(MAX_ARTISTS).optional(),
  tracksPerSeed: z.number().int().min(1).max(MAX_TRACKS),
  popularity: PopularityModeSchema,
  orderMode: TrackOrderModeSchema.default('random'),
}).strict();

export const GenreMixRequestSchema = PlaylistMetadataSchema.extend({
  kind: z.literal('genre_mix'),
  genreIds: z.array(z.string().min(1)).min(1).max(MAX_GENRES),
  tracksPerSeed: z.number().int().min(1).max(MAX_TRACKS),
  popularity: PopularityModeSchema,
  orderMode: TrackOrderModeSchema.default('random'),
}).strict();

export const CreateMixRequestSchema = z.discriminatedUnion('kind', [
  ArtistMixRequestSchema,
  GenreMixRequestSchema,
]);

export const DiscoverArtistRequestSchema = PlaylistMetadataSchema.extend({
  kind: z.literal('discover_artist'),
  artistId: z.string().min(1),
  artist: ArtistSchema.optional(),
  targetTrackCount: DiscoverTrackTargetSchema,
  popularity: PopularityModeSchema,
  orderMode: TrackOrderModeSchema.default('random'),
}).strict();

export const DiscoverTrackRequestSchema = PlaylistMetadataSchema.extend({
  kind: z.literal('discover_track'),
  trackId: z.string().min(1),
  track: TrackSeedSchema,
  targetTrackCount: DiscoverTrackTargetSchema,
  popularity: PopularityModeSchema,
  orderMode: TrackOrderModeSchema.default('random'),
}).strict();

export const CreateDiscoverRequestSchema = z.discriminatedUnion('kind', [
  DiscoverArtistRequestSchema,
  DiscoverTrackRequestSchema,
]);

const publicationOnlyFields = {
  coverImageBase64: true,
  persistToLibrary: true,
} as const;

export const GenerateMixRequestSchema = z.discriminatedUnion('kind', [
  ArtistMixRequestSchema.omit(publicationOnlyFields),
  GenreMixRequestSchema.omit(publicationOnlyFields),
]);

export const GenerateDiscoverRequestSchema = z.discriminatedUnion('kind', [
  DiscoverArtistRequestSchema.omit(publicationOnlyFields),
  DiscoverTrackRequestSchema.omit(publicationOnlyFields),
]);

export const RenamePlaylistRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
}).strict();

export const BulkLibraryRequestSchema = z.object({
  action: BulkLibraryActionSchema,
  q: z.string().trim().max(100).optional(),
  playlistIds: z.array(z.string().min(1)).optional(),
}).strict();

const QueryBooleanSchema = z.preprocess(
  (value) => {
    if (value === '1' || value === 'true') return true;
    if (value === '0' || value === 'false') return false;
    return value;
  },
  z.boolean(),
);

export const PlaylistLibraryQuerySchema = z.object({
  sync: QueryBooleanSchema.default(false),
  limit: z.coerce.number().int().min(1).max(50).default(5),
  offset: z.coerce.number().int().nonnegative().default(0),
  q: z.string().trim().max(100).optional(),
});

export const DeletePlaylistQuerySchema = z.object({
  fromSpotify: QueryBooleanSchema.default(false),
});

export const SearchQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export const StartPlaybackRequestSchema = z
  .object({
    contextUri: z.string().min(1).optional(),
    uris: z.array(z.string().min(1)).optional(),
    offsetUri: z.string().min(1).optional(),
    deviceId: z.string().min(1).optional(),
  })
  .strict()
  .refine(
    (value) => Boolean(value.contextUri || value.uris?.length),
    'Playback requires a playlist or at least one track.',
  );

export const PlaybackDeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  isActive: z.boolean(),
});

export const PlaylistSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string(),
  kind: PlaylistKindSchema,
  seeds: z.array(PlaylistSeedSchema),
  seedCount: z.number().int().nonnegative(),
  trackCount: z.number().int().nonnegative(),
  totalDurationMs: z.number().int().nonnegative(),
  spotifyUrl: z.string().nullable(),
  spotifyId: z.string().optional(),
  status: PlaylistStatusSchema,
  missingOnSpotify: z.boolean(),
  imageUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const PlaylistDetailSchema = PlaylistSummarySchema.extend({
  tracks: z.array(TrackSchema),
  generation: PlaylistGenerationSchema,
});

export const PlaylistTransferOfferSchema = z.object({
  token: z.string().min(1).max(TRANSFER_TOKEN_MAX_LENGTH),
  expiresAt: z.string(),
});

export const GeneratedPlaylistSchema = z.object({
  name: z.string(),
  description: z.string(),
  generation: PlaylistGenerationSchema,
  seeds: z.array(PlaylistSeedSchema),
  tracks: z.array(TrackSchema),
  coverArtwork: z
    .object({
      imageUrl: z.string().min(1),
      spotifyUrl: z.string().min(1),
    })
    .optional(),
  transfer: PlaylistTransferOfferSchema.nullable(),
});

export const CreateTransferRequestSchema = z
  .object({
    transferToken: z.string().min(1).max(TRANSFER_TOKEN_MAX_LENGTH),
  })
  .strict();

export const PlaylistTransferSchema = z.object({
  url: z.url(),
  expiresAt: z.string(),
  trackCount: z.number().int().positive(),
});

export const PlaylistLibraryPageSchema = z.object({
  playlists: z.array(PlaylistSummarySchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  activeCount: z.number().int().nonnegative(),
  deletedCount: z.number().int().nonnegative(),
});

export const BulkLibraryResultSchema = z.object({
  action: BulkLibraryActionSchema,
  affected: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

export const RankedSeedUsageSchema = z.object({
  seedKey: z.string(),
  name: z.string(),
  imageUrl: z.string().nullable().optional(),
  useCount: z.number().int().nonnegative(),
  lastUsedAt: z.string(),
});

export const UserUsageStatsSchema = z.object({
  artistMixCount: z.number().int().nonnegative(),
  genreMixCount: z.number().int().nonnegative(),
  uniqueArtists: z.number().int().nonnegative(),
  uniqueGenres: z.number().int().nonnegative(),
  topArtists: z.array(RankedSeedUsageSchema),
  topGenres: z.array(RankedSeedUsageSchema),
});

export const ApiErrorResponseSchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const GENERATION_PHASES = [
  'resolving_seeds',
  'matching_tracks',
  'publishing',
] as const;
export const GenerationPhaseSchema = z.enum(GENERATION_PHASES);

export const GenerationProgressSchema = z.object({
  phase: GenerationPhaseSchema,
  current: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  percent: z.number().min(0).max(100),
  etaSeconds: z.number().int().nonnegative().nullable().optional(),
});

const GenerationProgressEventSchema = GenerationProgressSchema.extend({
  type: z.literal('progress'),
});
const GenerationErrorEventSchema = ApiErrorResponseSchema.extend({
  type: z.literal('error'),
});

export const GenerationStreamEventSchema = z.discriminatedUnion('type', [
  GenerationProgressEventSchema,
  z.object({
    type: z.literal('result'),
    playlist: PlaylistDetailSchema,
  }),
  GenerationErrorEventSchema,
]);

export const GeneratedPlaylistStreamEventSchema = z.discriminatedUnion(
  'type',
  [
    GenerationProgressEventSchema,
    z.object({
      type: z.literal('result'),
      playlist: GeneratedPlaylistSchema,
    }),
    GenerationErrorEventSchema,
  ],
);

export type ArtistDto = z.infer<typeof ArtistSchema>;
export type UserDto = z.infer<typeof UserSchema>;
export type AuthSession = z.infer<typeof AuthSessionSchema>;
export type OkResponse = z.infer<typeof OkResponseSchema>;
export type TrackDto = z.infer<typeof TrackSchema>;
export type TrackSeedDto = z.infer<typeof TrackSeedSchema>;
export type GenreDto = z.infer<typeof GenreSchema>;
export type PlaylistSeedDto = z.infer<typeof PlaylistSeedSchema>;
export type PlaylistGeneration = z.infer<typeof PlaylistGenerationSchema>;
export type CreateMixRequest = z.input<typeof CreateMixRequestSchema>;
export type CreateDiscoverRequest = z.input<typeof CreateDiscoverRequestSchema>;
export type GenerateMixRequest = z.input<typeof GenerateMixRequestSchema>;
export type GenerateDiscoverRequest = z.input<
  typeof GenerateDiscoverRequestSchema
>;
export type PlaylistSummary = z.infer<typeof PlaylistSummarySchema>;
export type PlaylistDetail = z.infer<typeof PlaylistDetailSchema>;
export type GeneratedPlaylistDto = z.infer<typeof GeneratedPlaylistSchema>;
export type PlaylistTransferOfferDto = z.infer<
  typeof PlaylistTransferOfferSchema
>;
export type CreateTransferRequest = z.infer<typeof CreateTransferRequestSchema>;
export type PlaylistTransferDto = z.infer<typeof PlaylistTransferSchema>;
export type PlaylistLibraryPage = z.infer<typeof PlaylistLibraryPageSchema>;
export type BulkLibraryResult = z.infer<typeof BulkLibraryResultSchema>;
export type PlaylistLibraryQuery = z.infer<
  typeof PlaylistLibraryQuerySchema
>;
export type DeletePlaylistQuery = z.infer<
  typeof DeletePlaylistQuerySchema
>;
export type SearchQuery = z.infer<typeof SearchQuerySchema>;
export type RankedSeedUsage = z.infer<typeof RankedSeedUsageSchema>;
export type UserUsageStats = z.infer<typeof UserUsageStatsSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
export type GenerationPhase = z.infer<typeof GenerationPhaseSchema>;
export type GenerationProgress = z.infer<typeof GenerationProgressSchema>;
export type GenerationStreamEvent = z.infer<
  typeof GenerationStreamEventSchema
>;
export type GeneratedPlaylistStreamEvent = z.infer<
  typeof GeneratedPlaylistStreamEventSchema
>;
export type StartPlaybackRequest = z.infer<typeof StartPlaybackRequestSchema>;
export type PlaybackDeviceDto = z.infer<typeof PlaybackDeviceSchema>;
