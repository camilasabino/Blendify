import { z } from 'zod';
import {
  AI_PROMPT_MAX_LENGTH,
  AI_REFINEMENT_MAX_LENGTH,
  AI_UNSUPPORTED_CONSTRAINT_CATEGORIES,
  AiMoodSchema,
  MAX_TRACKS,
  PlaylistKindSchema,
  PopularityModeSchema,
  TrackOrderModeSchema,
} from './index';

export const AI_INTENT_PROMPT_MAX_LENGTH = AI_PROMPT_MAX_LENGTH;
export const AI_INTENT_NAME_MAX_LENGTH = 200;
export const AI_INTENT_LIST_MAX_ITEMS = 25;
export const AI_INTENT_TARGET_TRACK_COUNT_MAX = 1_000;
export const AI_INTENT_TARGET_DURATION_MINUTES_MAX = 10_080;
export const AI_INTENT_USER_TEXT_MAX_LENGTH = 300;
export const AI_PROMPT_VERSION_MAX_LENGTH = 64;
export const AI_REFINEMENT_TEXT_MAX_LENGTH = AI_REFINEMENT_MAX_LENGTH;
export const AI_REFINEMENT_TRACK_POSITION_MAX = 1_000;
export const AI_REFINEMENT_PRESERVED_POSITIONS_MAX_ITEMS = MAX_TRACKS;
export const AI_SERVICE_ERROR_MESSAGE_MAX_LENGTH = 300;

export const UNSUPPORTED_CONSTRAINT_CATEGORIES =
  AI_UNSUPPORTED_CONSTRAINT_CATEGORIES;
export const CLARIFICATION_REASONS = [
  'ambiguous_request',
  'unsupported_constraint',
  'not_a_playlist_request',
] as const;
export const AI_SERVICE_ERROR_CODES = [
  'INVALID_REQUEST',
  'UNAUTHORIZED',
  'NOT_FOUND',
  'MODEL_UNAVAILABLE',
  'MODEL_RATE_LIMITED',
  'MODEL_TIMEOUT',
  'INVALID_MODEL_OUTPUT',
  'INTERNAL_ERROR',
] as const;
export const AI_INTENT_INTERPRETATION_STATUSES = [
  'available',
  'unavailable',
] as const;

const IntentNameSchema = z.string().trim().min(1).max(AI_INTENT_NAME_MAX_LENGTH);
const IntentNameListSchema = z.array(IntentNameSchema).max(AI_INTENT_LIST_MAX_ITEMS);
const TrackCountSchema = z
  .number()
  .int()
  .min(1)
  .max(AI_INTENT_TARGET_TRACK_COUNT_MAX);
const DurationMinutesSchema = z
  .number()
  .int()
  .min(0)
  .max(AI_INTENT_TARGET_DURATION_MINUTES_MAX);
const TrackPositionSchema = z
  .number()
  .int()
  .min(1)
  .max(AI_REFINEMENT_TRACK_POSITION_MAX);

export const IntentTrackReferenceSchema = z.strictObject({
  title: IntentNameSchema,
  artist: IntentNameSchema.nullable(),
});

export const UnsupportedConstraintSchema = z.strictObject({
  category: z.enum(UNSUPPORTED_CONSTRAINT_CATEGORIES),
  userText: z.string().trim().min(1).max(AI_INTENT_USER_TEXT_MAX_LENGTH),
});

export const PlaylistIntentSchema = z.strictObject({
  kind: PlaylistKindSchema,
  artists: IntentNameListSchema,
  genres: IntentNameListSchema,
  seedTracks: z.array(IntentTrackReferenceSchema).max(AI_INTENT_LIST_MAX_ITEMS),
  targetTrackCount: TrackCountSchema.nullable(),
  targetDurationMinutes: DurationMinutesSchema.nullable(),
  mood: AiMoodSchema.nullable(),
  popularity: PopularityModeSchema.nullable(),
  orderMode: TrackOrderModeSchema.nullable(),
  excludeArtists: IntentNameListSchema,
  excludeTracks: z
    .array(IntentTrackReferenceSchema)
    .max(AI_INTENT_LIST_MAX_ITEMS),
  unsupportedConstraints: z
    .array(UnsupportedConstraintSchema)
    .max(AI_INTENT_LIST_MAX_ITEMS),
});

export const IntentClarificationSchema = z.strictObject({
  reason: z.enum(CLARIFICATION_REASONS),
  unsupportedConstraints: z
    .array(UnsupportedConstraintSchema)
    .max(AI_INTENT_LIST_MAX_ITEMS),
});

export const IntentInterpretationSchema = z.discriminatedUnion('outcome', [
  z.strictObject({
    outcome: z.literal('interpreted'),
    intent: PlaylistIntentSchema,
  }),
  z.strictObject({
    outcome: z.literal('needs_clarification'),
    clarification: IntentClarificationSchema,
  }),
]);

function setOperation<T extends z.ZodType>(value: T) {
  return z.strictObject({ operation: z.literal('set'), value });
}

const ClearOperationSchema = z.strictObject({ operation: z.literal('clear') });

function nullableValuePatch<T extends z.ZodType>(value: T) {
  return z
    .discriminatedUnion('operation', [setOperation(value), ClearOperationSchema])
    .nullable();
}

export const NameListPatchSchema = z.strictObject({
  add: IntentNameListSchema,
  remove: IntentNameListSchema,
});

export const TrackListPatchSchema = z.strictObject({
  add: z.array(IntentTrackReferenceSchema).max(AI_INTENT_LIST_MAX_ITEMS),
  remove: z.array(IntentTrackReferenceSchema).max(AI_INTENT_LIST_MAX_ITEMS),
});

export const PositionListPatchSchema = z.strictObject({
  add: z.array(TrackPositionSchema).max(AI_REFINEMENT_PRESERVED_POSITIONS_MAX_ITEMS),
  remove: z
    .array(TrackPositionSchema)
    .max(AI_REFINEMENT_PRESERVED_POSITIONS_MAX_ITEMS),
});

export const IntentPatchSchema = z.strictObject({
  kind: setOperation(PlaylistKindSchema).nullable(),
  artists: NameListPatchSchema,
  genres: NameListPatchSchema,
  seedTracks: TrackListPatchSchema,
  targetTrackCount: nullableValuePatch(TrackCountSchema),
  targetDurationMinutes: nullableValuePatch(DurationMinutesSchema),
  mood: nullableValuePatch(AiMoodSchema),
  popularity: nullableValuePatch(PopularityModeSchema),
  orderMode: nullableValuePatch(TrackOrderModeSchema),
  excludeArtists: NameListPatchSchema,
  excludeTracks: TrackListPatchSchema,
});

export const PreservationConstraintsSchema = z.strictObject({
  firstTracks: TrackPositionSchema.nullable(),
  positions: z
    .array(TrackPositionSchema)
    .max(AI_REFINEMENT_PRESERVED_POSITIONS_MAX_ITEMS),
  artists: IntentNameListSchema,
});

export const PreservationPatchSchema = z.strictObject({
  firstTracks: nullableValuePatch(TrackPositionSchema),
  positions: PositionListPatchSchema,
  artists: NameListPatchSchema,
});

export const RefinementInterpretationSchema = z.discriminatedUnion('outcome', [
  z.strictObject({
    outcome: z.literal('interpreted'),
    patch: IntentPatchSchema,
    preservation: PreservationPatchSchema,
    unsupportedConstraints: z
      .array(UnsupportedConstraintSchema)
      .max(AI_INTENT_LIST_MAX_ITEMS),
  }),
  z.strictObject({
    outcome: z.literal('needs_clarification'),
    clarification: IntentClarificationSchema,
  }),
]);

export const PlanRefinementRequestSchema = z.strictObject({
  intent: PlaylistIntentSchema,
  preservation: PreservationConstraintsSchema,
  refinement: z.string().trim().min(1).max(AI_REFINEMENT_TEXT_MAX_LENGTH),
});

export const PlanRefinementResponseSchema = z.strictObject({
  promptVersion: z.string().min(1).max(AI_PROMPT_VERSION_MAX_LENGTH),
  result: RefinementInterpretationSchema,
});

export const InterpretIntentRequestSchema = z.strictObject({
  prompt: z.string().trim().min(1).max(AI_INTENT_PROMPT_MAX_LENGTH),
});

export const InterpretIntentResponseSchema = z.strictObject({
  promptVersion: z.string().min(1).max(AI_PROMPT_VERSION_MAX_LENGTH),
  result: IntentInterpretationSchema,
});

export const AiServiceErrorResponseSchema = z.strictObject({
  code: z.enum(AI_SERVICE_ERROR_CODES),
  message: z.string().min(1).max(AI_SERVICE_ERROR_MESSAGE_MAX_LENGTH),
});

export const AiServiceHealthSchema = z.strictObject({
  status: z.literal('ok'),
  intentInterpretation: z.enum(AI_INTENT_INTERPRETATION_STATUSES),
});

export const AI_SERVICE_WIRE_SCHEMAS = {
  InterpretIntentRequest: InterpretIntentRequestSchema,
  InterpretIntentResponse: InterpretIntentResponseSchema,
  PlanRefinementRequest: PlanRefinementRequestSchema,
  PlanRefinementResponse: PlanRefinementResponseSchema,
  AiServiceErrorResponse: AiServiceErrorResponseSchema,
  AiServiceHealth: AiServiceHealthSchema,
} as const;

export type IntentTrackReference = z.infer<typeof IntentTrackReferenceSchema>;
export type UnsupportedConstraint = z.infer<typeof UnsupportedConstraintSchema>;
export type UnsupportedConstraintCategory =
  (typeof UNSUPPORTED_CONSTRAINT_CATEGORIES)[number];
export type ClarificationReason = (typeof CLARIFICATION_REASONS)[number];
export type PlaylistIntent = z.infer<typeof PlaylistIntentSchema>;
export type IntentClarification = z.infer<typeof IntentClarificationSchema>;
export type IntentInterpretation = z.infer<typeof IntentInterpretationSchema>;
export type InterpretIntentRequest = z.infer<typeof InterpretIntentRequestSchema>;
export type InterpretIntentResponse = z.infer<
  typeof InterpretIntentResponseSchema
>;
export type NameListPatch = z.infer<typeof NameListPatchSchema>;
export type TrackListPatch = z.infer<typeof TrackListPatchSchema>;
export type PositionListPatch = z.infer<typeof PositionListPatchSchema>;
export type IntentPatch = z.infer<typeof IntentPatchSchema>;
export type PreservationConstraints = z.infer<
  typeof PreservationConstraintsSchema
>;
export type PreservationPatch = z.infer<typeof PreservationPatchSchema>;
export type RefinementInterpretation = z.infer<
  typeof RefinementInterpretationSchema
>;
export type PlanRefinementRequest = z.infer<typeof PlanRefinementRequestSchema>;
export type PlanRefinementResponse = z.infer<
  typeof PlanRefinementResponseSchema
>;
export type AiServiceErrorCode = (typeof AI_SERVICE_ERROR_CODES)[number];
export type AiServiceErrorResponse = z.infer<
  typeof AiServiceErrorResponseSchema
>;
export type AiServiceHealth = z.infer<typeof AiServiceHealthSchema>;
