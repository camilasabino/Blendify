import { z } from 'zod';

export * from './genre-labels';
export * from './genre-lookup-key';
export * from './genre-region-names';
export * from './mix-playlist-name';

export const MAX_ARTISTS = 12;
export const MAX_GENRES = 5;
export const PLAYLIST_NAME_MAX_LENGTH = 100;
export const MAX_TRACKS = 50;
export const MIN_DISCOVER_TRACKS = 1;
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
export const BULK_LIBRARY_ACTIONS = ['purge_active', 'clear_library'] as const;
export const GENRE_REGIONS = [
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
] as const;
export const GENRE_LABEL_LOCALES = ['en', 'es', 'pt'] as const;

export const PopularityModeSchema = z.enum(POPULARITY_MODES);
export const TrackOrderModeSchema = z.enum(TRACK_ORDER_MODES);
export const PlaylistKindSchema = z.enum(PLAYLIST_KINDS);
export const PlaylistStatusSchema = z.enum(PLAYLIST_STATUSES);
export const DiscoverTrackTargetSchema = z
  .number()
  .int()
  .min(MIN_DISCOVER_TRACKS)
  .max(MAX_TRACKS);
export const BulkLibraryActionSchema = z.enum(BULK_LIBRARY_ACTIONS);
export const GenreRegionSchema = z.enum(GENRE_REGIONS);

export type PopularityMode = z.infer<typeof PopularityModeSchema>;
export type TrackOrderMode = z.infer<typeof TrackOrderModeSchema>;
export type PlaylistKind = z.infer<typeof PlaylistKindSchema>;
export type PlaylistStatus = z.infer<typeof PlaylistStatusSchema>;
export type DiscoverTrackTarget = z.infer<typeof DiscoverTrackTargetSchema>;
export type BulkLibraryAction = z.infer<typeof BulkLibraryActionSchema>;
export type GenreRegion = z.infer<typeof GenreRegionSchema>;
export type GenreLabelLocale = (typeof GENRE_LABEL_LOCALES)[number];

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
  popularity: z.number().int().min(0).max(100).nullable(),
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
  popularity: z.number().int().min(0).max(100).nullable().optional(),
});

export const GenreSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  labels: z
    .partialRecord(z.enum(GENRE_LABEL_LOCALES), z.string().min(1).max(200))
    .optional(),
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
    region: GenreRegionSchema.optional(),
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
  name: z.string().max(PLAYLIST_NAME_MAX_LENGTH).default(''),
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
  region: GenreRegionSchema.optional(),
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

const PlaylistNameSchema = z.string().trim().min(1).max(PLAYLIST_NAME_MAX_LENGTH);

export const RenamePlaylistRequestSchema = z.object({
  name: PlaylistNameSchema,
}).strict();

export const BulkLibraryRequestSchema = z.object({
  action: BulkLibraryActionSchema,
  q: z.string().trim().max(100).optional(),
  playlistIds: z.array(z.string().min(1)).optional(),
}).strict();

const QueryBooleanSchema = z.preprocess(
  (value) => {
    if (value === '1' || value === 'true') {
      return true;
    }
    if (value === '0' || value === 'false') {
      return false;
    }
    return value;
  },
  z.boolean(),
);

export const PlaylistLibraryQuerySchema = z.object({
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
  imageUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const PlaylistDetailSchema = PlaylistSummarySchema.extend({
  tracks: z.array(TrackSchema),
  generation: PlaylistGenerationSchema,
});

export const PublishedPlaylistSchema = PlaylistDetailSchema.extend({
  coverUploadFailed: z.boolean().optional(),
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
});

export const BulkLibraryResultSchema = z.object({
  action: BulkLibraryActionSchema,
  affected: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

export const LibrarySyncResultSchema = z.object({
  checkedCount: z.number().int().nonnegative(),
  removedCount: z.number().int().nonnegative(),
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

export const SPOTIFY_FAILURE_CATEGORIES = [
  'upstream_error',
  'timeout',
  'network',
  'forbidden',
  'rejected',
] as const;
export const SpotifyFailureCategorySchema = z.enum(SPOTIFY_FAILURE_CATEGORIES);

export const SPOTIFY_WAIT_SOURCES = ['spotify', 'blendify'] as const;
export const SpotifyWaitSourceSchema = z.enum(SPOTIFY_WAIT_SOURCES);

export const SpotifyFailureDetailsSchema = z.object({
  operation: z.string().min(1),
  category: SpotifyFailureCategorySchema,
  status: z.number().int().nullable(),
  retryAfterSeconds: z.number().int().positive().optional(),
  retryAfterSource: z.literal('spotify').optional(),
});

export const SpotifyThrottleDetailsSchema = z.object({
  retryAfterSeconds: z.number().int().positive().nullable(),
  retryAfterSource: SpotifyWaitSourceSchema.nullable(),
  reason: z.string(),
});

export const PLAYLIST_PUBLISH_STEPS = ['add_tracks', 'save_to_library'] as const;
export const PLAYLIST_TRACKS_ADDED_STATES = ['none', 'unknown', 'all'] as const;

export const PlaylistPublishIncompleteDetailsSchema = z.object({
  spotifyId: z.string().min(1),
  spotifyUrl: z.string().min(1).nullable(),
  failedStep: z.enum(PLAYLIST_PUBLISH_STEPS),
  tracksAdded: z.enum(PLAYLIST_TRACKS_ADDED_STATES),
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
    playlist: PublishedPlaylistSchema,
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

export const AI_PROMPT_MAX_LENGTH = 2_000;
export const AI_REFINEMENT_MAX_LENGTH = AI_PROMPT_MAX_LENGTH;
export const AI_CLARIFICATION_OPTION_ID_MAX_LENGTH = 64;
export const AI_UNSUPPORTED_CONSTRAINT_CATEGORIES = [
  'duration',
  'era',
  'energy',
  'mood',
  'activity',
  'tempo',
  'progression',
  'artist_attribute',
  'genre_exclusion',
  'other',
] as const;
export const AI_MOODS = [
  'happy',
  'calm',
  'energetic',
  'sad',
  'romantic',
  'angry',
  'dark',
  'nostalgic',
  'dreamy',
] as const;
export const AI_SESSION_STATUSES = ['ready', 'needs_clarification'] as const;
export const AI_SEED_TYPES = ['artist', 'genre', 'track'] as const;
export const AI_CLARIFICATION_REASONS = [
  'ambiguous_request',
  'unsupported_constraint',
  'not_a_playlist_request',
  'mixed_seed_types',
  'too_many_seeds',
  'track_count_over_limit',
  'invalid_duration',
  'unsupported_ordering',
  'unknown_genres',
  'ambiguous_genres',
  'conflicting_regions',
] as const;

export const AiUnsupportedConstraintCategorySchema = z.enum(
  AI_UNSUPPORTED_CONSTRAINT_CATEGORIES,
);
export const AiSeedTypeSchema = z.enum(AI_SEED_TYPES);
export const AiMoodSchema = z.enum(AI_MOODS);

export const AiTrackReferenceSchema = z.strictObject({
  title: z.string().min(1).max(200),
  artist: z.string().min(1).max(200).nullable(),
});

export const AI_MOOD_NOT_APPLIED_REASONS = [
  'seed_not_mood_based',
  'explicit_genre_precedence',
] as const;

export const AiUnmetConstraintSchema = z.strictObject({
  category: AiUnsupportedConstraintCategorySchema,
  userText: z.string().min(1).max(300),
});

export const AiIntentSummarySchema = z.strictObject({
  kind: PlaylistKindSchema,
  artists: z.array(z.string().min(1).max(200)),
  genres: z.array(z.string().min(1).max(200)),
  region: GenreRegionSchema.nullable(),
  seedTrack: AiTrackReferenceSchema.nullable(),
  targetTrackCount: z.number().int().min(1).max(MAX_TRACKS).nullable(),
  targetDurationMinutes: z.number().int().positive().nullable(),
  mood: AiMoodSchema.nullable(),
  moodNotAppliedReason: z.enum(AI_MOOD_NOT_APPLIED_REASONS).nullable(),
  popularity: PopularityModeSchema.nullable(),
  orderMode: TrackOrderModeSchema.nullable(),
  excludeArtists: z.array(z.string().min(1).max(200)),
  excludeTracks: z.array(AiTrackReferenceSchema),
  unmetConstraints: z.array(AiUnmetConstraintSchema),
});

const AiClarificationOptionIdSchema = z
  .string()
  .min(1)
  .max(AI_CLARIFICATION_OPTION_ID_MAX_LENGTH);

export const AiClarificationOptionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    id: AiClarificationOptionIdSchema,
    type: z.literal('set_kind'),
    kind: PlaylistKindSchema,
  }),
  z.strictObject({
    id: AiClarificationOptionIdSchema,
    type: z.literal('keep_seed'),
    seedType: AiSeedTypeSchema,
    label: z.string().min(1).max(200),
  }),
  z.strictObject({
    id: AiClarificationOptionIdSchema,
    type: z.literal('set_track_count'),
    trackCount: z.number().int().min(1).max(MAX_TRACKS),
  }),
  z.strictObject({
    id: AiClarificationOptionIdSchema,
    type: z.literal('set_order_mode'),
    orderMode: TrackOrderModeSchema,
  }),
]);

export const AiClarificationSchema = z.strictObject({
  reason: z.enum(AI_CLARIFICATION_REASONS),
  seedType: AiSeedTypeSchema.nullable(),
  limit: z.number().int().positive().nullable(),
  names: z.array(z.string().min(1).max(200)),
  unsupportedConstraints: z.array(AiUnmetConstraintSchema),
  options: z.array(AiClarificationOptionSchema),
});

export const AiSessionSchema = z.strictObject({
  sessionId: z.string().min(1),
  expiresAt: z.iso.datetime(),
  status: z.enum(AI_SESSION_STATUSES),
  intent: AiIntentSummarySchema.nullable(),
  clarification: AiClarificationSchema.nullable(),
});

export const AiSessionCreatedSchema = AiSessionSchema.extend({
  accessKey: z.string().min(1),
});

export const AI_REFINEMENT_CLARIFICATION_REASONS = [
  'ambiguous_request',
  'unsupported_constraint',
  'not_a_playlist_request',
  'mixed_seed_types',
  'too_many_seeds',
  'track_count_over_limit',
  'invalid_duration',
  'unsupported_ordering',
  'unknown_genres',
  'ambiguous_genres',
  'conflicting_regions',
  'conflicting_changes',
  'preserved_track_out_of_range',
  'preserved_artist_not_found',
] as const;

export const AiPreservationSchema = z.strictObject({
  firstTracks: z.number().int().min(1).max(MAX_TRACKS).nullable(),
  positions: z.array(z.number().int().min(1).max(MAX_TRACKS)).max(MAX_TRACKS),
  artists: z.array(z.string().min(1).max(200)),
});

export const AiRefinementClarificationSchema = z.strictObject({
  reason: z.enum(AI_REFINEMENT_CLARIFICATION_REASONS),
  seedType: AiSeedTypeSchema.nullable(),
  limit: z.number().int().positive().nullable(),
  names: z.array(z.string().min(1).max(200)),
  unsupportedConstraints: z.array(AiUnmetConstraintSchema),
});

export const AI_GENERATION_FAILURE_CATEGORIES = [
  'seed_not_found',
  'provider_rate_limited',
  'provider_unavailable',
  'insufficient_results',
  'failed',
] as const;

export const AiGeneratedPlaylistSchema = GeneratedPlaylistSchema.omit({
  generation: true,
  transfer: true,
});

export const AiGenerationUnmetConstraintSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('track_count'),
    requested: z.number().int().min(1).max(MAX_TRACKS),
    actual: z.number().int().nonnegative(),
  }),
  z.strictObject({
    type: z.literal('duration'),
    requestedMinutes: z.number().int().positive(),
    actualDurationMs: z.number().int().nonnegative(),
  }),
]);

const aiGenerationOutcomeShape = {
  playlist: AiGeneratedPlaylistSchema,
  trackCount: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  unmetConstraints: z.array(AiGenerationUnmetConstraintSchema),
  transferAvailable: z.boolean(),
};

export const AiGenerationSchema = z.strictObject({
  sessionId: z.string().min(1),
  expiresAt: z.iso.datetime(),
  status: z.literal('generated'),
  intent: AiIntentSummarySchema,
  ...aiGenerationOutcomeShape,
});

export const AI_SEED_NOT_FOUND_NAME_MAX_LENGTH = 403;

export const AiSeedNotFoundSchema = z.strictObject({
  seedType: AiSeedTypeSchema,
  names: z
    .array(z.string().min(1).max(AI_SEED_NOT_FOUND_NAME_MAX_LENGTH))
    .min(1)
    .max(MAX_ARTISTS),
});

export const AiGenerationFailureSchema = z
  .strictObject({
    code: z.string().min(1),
    category: z.enum(AI_GENERATION_FAILURE_CATEGORIES),
    retryAfterSeconds: z.number().nonnegative().nullable(),
    retryAfterSource: SpotifyWaitSourceSchema.nullable().optional(),
    seedNotFound: AiSeedNotFoundSchema.nullable(),
  })
  .refine(
    (failure) =>
      failure.seedNotFound === null || failure.category === 'seed_not_found',
    { path: ['seedNotFound'] },
  );

const PlaylistPositionSchema = z.number().int().min(1).max(MAX_TRACKS);
const TrackCountSchema = z.number().int().min(0).max(MAX_TRACKS);
const ProviderTrackIdSchema = z.string().min(1);

const AiPlaylistTotalsSchema = z.strictObject({
  trackCount: TrackCountSchema,
  durationMs: z.number().int().nonnegative(),
});

export const AiRefinementTrackDiffSchema = z.strictObject({
  added: z
    .array(
      z.strictObject({
        trackId: ProviderTrackIdSchema,
        position: PlaylistPositionSchema,
      }),
    )
    .max(MAX_TRACKS),
  removed: z
    .array(
      z.strictObject({
        trackId: ProviderTrackIdSchema,
        position: PlaylistPositionSchema,
      }),
    )
    .max(MAX_TRACKS),
  moved: z
    .array(
      z.strictObject({
        trackId: ProviderTrackIdSchema,
        from: PlaylistPositionSchema,
        to: PlaylistPositionSchema,
      }),
    )
    .max(MAX_TRACKS),
  retainedCount: TrackCountSchema,
  replacedCount: TrackCountSchema,
  before: AiPlaylistTotalsSchema,
  after: AiPlaylistTotalsSchema,
});

const AiNameListChangeShape = {
  added: z.array(z.string().min(1).max(200)),
  removed: z.array(z.string().min(1).max(200)),
};
const AiTrackListChangeShape = {
  added: z.array(AiTrackReferenceSchema),
  removed: z.array(AiTrackReferenceSchema),
};
const AiCountChangeShape = {
  from: z.number().int().positive().nullable(),
  to: z.number().int().positive().nullable(),
};

export const AiIntentChangeSchema = z.discriminatedUnion('field', [
  z.strictObject({
    field: z.literal('kind'),
    from: PlaylistKindSchema,
    to: PlaylistKindSchema,
  }),
  z.strictObject({ field: z.literal('artists'), ...AiNameListChangeShape }),
  z.strictObject({ field: z.literal('genres'), ...AiNameListChangeShape }),
  z.strictObject({
    field: z.literal('region'),
    from: GenreRegionSchema.nullable(),
    to: GenreRegionSchema.nullable(),
  }),
  z.strictObject({ field: z.literal('seedTracks'), ...AiTrackListChangeShape }),
  z.strictObject({
    field: z.literal('targetTrackCount'),
    ...AiCountChangeShape,
  }),
  z.strictObject({
    field: z.literal('targetDurationMinutes'),
    ...AiCountChangeShape,
  }),
  z.strictObject({
    field: z.literal('mood'),
    from: AiMoodSchema.nullable(),
    to: AiMoodSchema.nullable(),
  }),
  z.strictObject({
    field: z.literal('popularity'),
    from: PopularityModeSchema.nullable(),
    to: PopularityModeSchema.nullable(),
  }),
  z.strictObject({
    field: z.literal('orderMode'),
    from: TrackOrderModeSchema.nullable(),
    to: TrackOrderModeSchema.nullable(),
  }),
  z.strictObject({
    field: z.literal('excludeArtists'),
    ...AiNameListChangeShape,
  }),
  z.strictObject({
    field: z.literal('excludeTracks'),
    ...AiTrackListChangeShape,
  }),
]);

export const AiRefinementDiffSchema = z.strictObject({
  tracks: AiRefinementTrackDiffSchema,
  intent: z.array(AiIntentChangeSchema),
  preservedPositions: z.array(PlaylistPositionSchema).max(MAX_TRACKS),
});

export const AiRefinementCandidateSchema = z.strictObject({
  playlist: AiGeneratedPlaylistSchema,
  trackCount: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  unmetConstraints: z.array(AiGenerationUnmetConstraintSchema),
});

export const AI_REFINEMENT_ID_MAX_LENGTH = 64;

export const AiRefinementIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9-]+$/)
  .max(AI_REFINEMENT_ID_MAX_LENGTH);

const aiProposedRefinementShape = {
  intent: AiIntentSummarySchema,
  preservation: AiPreservationSchema,
  notApplied: z.array(AiUnmetConstraintSchema),
};

export const AiRefinementSchema = z.discriminatedUnion('status', [
  z.strictObject({
    id: AiRefinementIdSchema,
    status: z.literal('candidate_ready'),
    ...aiProposedRefinementShape,
    candidate: AiRefinementCandidateSchema,
    diff: AiRefinementDiffSchema,
  }),
  z.strictObject({
    id: AiRefinementIdSchema,
    status: z.literal('candidate_failed'),
    ...aiProposedRefinementShape,
    error: AiGenerationFailureSchema,
  }),
  z.strictObject({
    id: AiRefinementIdSchema,
    status: z.literal('needs_clarification'),
    clarification: AiRefinementClarificationSchema,
  }),
  z.strictObject({ id: AiRefinementIdSchema, status: z.literal('unchanged') }),
]);

export const AiCurrentPreservationSchema = AiPreservationSchema.extend({
  preservedPositions: z.array(PlaylistPositionSchema).max(MAX_TRACKS),
});

export const AiRefinementResultSchema = z.strictObject({
  sessionId: z.string().min(1),
  expiresAt: z.iso.datetime(),
  refinement: AiRefinementSchema,
});

export const AiSessionExecutionSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('generating') }),
  z.strictObject({
    status: z.literal('generated'),
    ...aiGenerationOutcomeShape,
  }),
  z.strictObject({
    status: z.literal('generation_failed'),
    error: AiGenerationFailureSchema,
  }),
]);

export const AiSessionDestinationSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('publishing') }),
  z.strictObject({
    status: z.literal('published'),
    spotifyUrl: z.string().min(1).nullable(),
    savedToLibrary: z.boolean(),
  }),
  z.strictObject({
    status: z.literal('publish_incomplete'),
    spotifyUrl: z.string().min(1).nullable(),
  }),
  z.strictObject({
    status: z.literal('transfer_prepared'),
    transfer: PlaylistTransferSchema.strict(),
  }),
]);

export const AiSessionStateSchema = AiSessionSchema.extend({
  execution: AiSessionExecutionSchema.nullable(),
  destination: AiSessionDestinationSchema.nullable(),
  preservation: AiCurrentPreservationSchema.nullable(),
  refinement: AiRefinementSchema.nullable(),
});

export const AiGenerationStreamEventSchema = z.discriminatedUnion('type', [
  GenerationProgressEventSchema,
  z.object({
    type: z.literal('result'),
    playlist: AiGenerationSchema,
  }),
  GenerationErrorEventSchema,
]);

export const CreateAiSessionRequestSchema = z.strictObject({
  prompt: z.string().trim().min(1).max(AI_PROMPT_MAX_LENGTH),
});

export const AnswerAiClarificationRequestSchema = z.strictObject({
  optionId: AiClarificationOptionIdSchema,
});

const PreservedPositionListSchema = z
  .array(PlaylistPositionSchema)
  .max(MAX_TRACKS);

export const CreateAiRefinementRequestSchema = z.strictObject({
  refinement: z.string().trim().min(1).max(AI_REFINEMENT_MAX_LENGTH),
  preservePositions: z
    .strictObject({
      add: PreservedPositionListSchema,
      remove: PreservedPositionListSchema,
    })
    .optional(),
});

export const PublishAiPlaylistRequestSchema = z.strictObject({
  name: PlaylistNameSchema,
  coverImageBase64: PlaylistMetadataSchema.shape.coverImageBase64,
  persistToLibrary: PlaylistMetadataSchema.shape.persistToLibrary,
});

export const TransferAiPlaylistRequestSchema = z.strictObject({
  name: PlaylistNameSchema,
});

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
export type PublishedPlaylist = z.infer<typeof PublishedPlaylistSchema>;
export type GeneratedPlaylistDto = z.infer<typeof GeneratedPlaylistSchema>;
export type PlaylistTransferOfferDto = z.infer<
  typeof PlaylistTransferOfferSchema
>;
export type CreateTransferRequest = z.infer<typeof CreateTransferRequestSchema>;
export type PlaylistTransferDto = z.infer<typeof PlaylistTransferSchema>;
export type PlaylistLibraryPage = z.infer<typeof PlaylistLibraryPageSchema>;
export type BulkLibraryResult = z.infer<typeof BulkLibraryResultSchema>;
export type LibrarySyncResult = z.infer<typeof LibrarySyncResultSchema>;
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
export type SpotifyFailureCategory = z.infer<typeof SpotifyFailureCategorySchema>;
export type SpotifyFailureDetails = z.infer<typeof SpotifyFailureDetailsSchema>;
export type SpotifyWaitSource = z.infer<typeof SpotifyWaitSourceSchema>;
export type SpotifyThrottleDetails = z.infer<typeof SpotifyThrottleDetailsSchema>;
export type PlaylistPublishStep = (typeof PLAYLIST_PUBLISH_STEPS)[number];
export type PlaylistTracksAddedState =
  (typeof PLAYLIST_TRACKS_ADDED_STATES)[number];
export type PlaylistPublishIncompleteDetails = z.infer<
  typeof PlaylistPublishIncompleteDetailsSchema
>;
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
export type AiUnsupportedConstraintCategory = z.infer<
  typeof AiUnsupportedConstraintCategorySchema
>;
export type AiSeedType = z.infer<typeof AiSeedTypeSchema>;
export type AiMood = z.infer<typeof AiMoodSchema>;
export type AiTrackReference = z.infer<typeof AiTrackReferenceSchema>;
export type AiUnmetConstraint = z.infer<typeof AiUnmetConstraintSchema>;
export type AiIntentSummary = z.infer<typeof AiIntentSummarySchema>;
export type AiClarificationOption = z.infer<typeof AiClarificationOptionSchema>;
export type AiClarificationReason = (typeof AI_CLARIFICATION_REASONS)[number];
export type AiClarification = z.infer<typeof AiClarificationSchema>;
export type AiSessionDto = z.infer<typeof AiSessionSchema>;
export type AiSessionCreatedDto = z.infer<typeof AiSessionCreatedSchema>;
export type AiPreservationDto = z.infer<typeof AiPreservationSchema>;
export type AiRefinementClarificationReason =
  (typeof AI_REFINEMENT_CLARIFICATION_REASONS)[number];
export type AiRefinementClarificationDto = z.infer<
  typeof AiRefinementClarificationSchema
>;
export type AiRefinementTrackDiffDto = z.infer<
  typeof AiRefinementTrackDiffSchema
>;
export type AiIntentChangeDto = z.infer<typeof AiIntentChangeSchema>;
export type AiRefinementDiffDto = z.infer<typeof AiRefinementDiffSchema>;
export type AiRefinementCandidateDto = z.infer<
  typeof AiRefinementCandidateSchema
>;
export type AiRefinementDto = z.infer<typeof AiRefinementSchema>;
export type AiCurrentPreservationDto = z.infer<
  typeof AiCurrentPreservationSchema
>;
export type AiRefinementResultDto = z.infer<typeof AiRefinementResultSchema>;
export type CreateAiRefinementRequest = z.infer<
  typeof CreateAiRefinementRequestSchema
>;
export type AiMoodNotAppliedReason =
  (typeof AI_MOOD_NOT_APPLIED_REASONS)[number];
export type AiGeneratedPlaylist = z.infer<typeof AiGeneratedPlaylistSchema>;
export type AiGenerationUnmetConstraint = z.infer<
  typeof AiGenerationUnmetConstraintSchema
>;
export type AiGenerationDto = z.infer<typeof AiGenerationSchema>;
export type AiGenerationFailureCategory =
  (typeof AI_GENERATION_FAILURE_CATEGORIES)[number];
export type AiSeedNotFound = z.infer<typeof AiSeedNotFoundSchema>;
export type AiGenerationFailureDto = z.infer<typeof AiGenerationFailureSchema>;
export type AiSessionExecutionDto = z.infer<typeof AiSessionExecutionSchema>;
export type AiSessionDestinationDto = z.infer<typeof AiSessionDestinationSchema>;
export type AiSessionStateDto = z.infer<typeof AiSessionStateSchema>;
export type AiGenerationStreamEvent = z.infer<
  typeof AiGenerationStreamEventSchema
>;
export type CreateAiSessionRequest = z.infer<typeof CreateAiSessionRequestSchema>;
export type AnswerAiClarificationRequest = z.infer<
  typeof AnswerAiClarificationRequestSchema
>;
export type PublishAiPlaylistRequest = z.input<
  typeof PublishAiPlaylistRequestSchema
>;
export type TransferAiPlaylistRequest = z.infer<
  typeof TransferAiPlaylistRequestSchema
>;
