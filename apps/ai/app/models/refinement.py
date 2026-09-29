from typing import Annotated, Literal

from pydantic import Field, StringConstraints, TypeAdapter

from app.models.intent import (
    AI_INTENT_LIST_MAX_ITEMS,
    IntentClarification,
    IntentName,
    IntentTrackReference,
    Mood,
    PlaylistIntent,
    PlaylistKind,
    PopularityMode,
    TargetDurationMinutes,
    TargetTrackCount,
    TrackOrderMode,
    UnsupportedConstraint,
)
from app.models.interpretation import AI_INTENT_PROMPT_MAX_LENGTH, PromptVersion
from app.models.wire import WireModel

AI_REFINEMENT_TEXT_MAX_LENGTH = AI_INTENT_PROMPT_MAX_LENGTH
AI_REFINEMENT_DURATION_DELTA_MINUTES_MAX = 10_080
AI_REFINEMENT_TRACK_POSITION_MAX = 1_000
AI_REFINEMENT_PRESERVED_POSITIONS_MAX_ITEMS = 50

TrackPosition = Annotated[int, Field(ge=1, le=AI_REFINEMENT_TRACK_POSITION_MAX, strict=True)]
RefinementText = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=AI_REFINEMENT_TEXT_MAX_LENGTH
    ),
]
NameList = Annotated[list[IntentName], Field(max_length=AI_INTENT_LIST_MAX_ITEMS)]
TrackReferenceList = Annotated[
    list[IntentTrackReference], Field(max_length=AI_INTENT_LIST_MAX_ITEMS)
]
PositionList = Annotated[
    list[TrackPosition], Field(max_length=AI_REFINEMENT_PRESERVED_POSITIONS_MAX_ITEMS)
]


class ClearValue(WireModel):
    operation: Literal["clear"]


class SetKind(WireModel):
    operation: Literal["set"]
    value: PlaylistKind


class SetTrackCount(WireModel):
    operation: Literal["set"]
    value: TargetTrackCount


class SetDurationMinutes(WireModel):
    operation: Literal["set"]
    value: TargetDurationMinutes


class AdjustDurationMinutes(WireModel):
    operation: Literal["adjust"]
    delta_minutes: Annotated[
        int,
        Field(
            ge=-AI_REFINEMENT_DURATION_DELTA_MINUTES_MAX,
            le=AI_REFINEMENT_DURATION_DELTA_MINUTES_MAX,
            strict=True,
        ),
    ]


class SetMood(WireModel):
    operation: Literal["set"]
    value: Mood


class SetPopularity(WireModel):
    operation: Literal["set"]
    value: PopularityMode


class SetOrderMode(WireModel):
    operation: Literal["set"]
    value: TrackOrderMode


class SetFirstTracks(WireModel):
    operation: Literal["set"]
    value: TrackPosition


TrackCountPatch = Annotated[SetTrackCount | ClearValue, Field(discriminator="operation")]
DurationMinutesPatch = Annotated[
    SetDurationMinutes | ClearValue | AdjustDurationMinutes, Field(discriminator="operation")
]
MoodPatch = Annotated[SetMood | ClearValue, Field(discriminator="operation")]
PopularityPatch = Annotated[SetPopularity | ClearValue, Field(discriminator="operation")]
OrderModePatch = Annotated[SetOrderMode | ClearValue, Field(discriminator="operation")]
FirstTracksPatch = Annotated[SetFirstTracks | ClearValue, Field(discriminator="operation")]


class NameListPatch(WireModel):
    add: NameList
    remove: NameList


class TrackListPatch(WireModel):
    add: TrackReferenceList
    remove: TrackReferenceList


class PositionListPatch(WireModel):
    add: PositionList
    remove: PositionList


class IntentPatch(WireModel):
    kind: SetKind | None
    artists: NameListPatch
    genres: NameListPatch
    seed_tracks: TrackListPatch
    target_track_count: TrackCountPatch | None
    target_duration_minutes: DurationMinutesPatch | None
    mood: MoodPatch | None
    popularity: PopularityPatch | None
    order_mode: OrderModePatch | None
    exclude_artists: NameListPatch
    exclude_tracks: TrackListPatch


class PreservationConstraints(WireModel):
    first_tracks: TrackPosition | None
    positions: PositionList
    artists: NameList


class PreservationPatch(WireModel):
    first_tracks: FirstTracksPatch | None
    positions: PositionListPatch
    artists: NameListPatch


class InterpretedRefinement(WireModel):
    outcome: Literal["interpreted"]
    patch: IntentPatch
    preservation: PreservationPatch
    unsupported_constraints: Annotated[
        list[UnsupportedConstraint], Field(max_length=AI_INTENT_LIST_MAX_ITEMS)
    ]


class RefinementClarificationNeeded(WireModel):
    outcome: Literal["needs_clarification"]
    clarification: IntentClarification


RefinementInterpretation = Annotated[
    InterpretedRefinement | RefinementClarificationNeeded, Field(discriminator="outcome")
]

refinement_interpretation_adapter: TypeAdapter[
    InterpretedRefinement | RefinementClarificationNeeded
] = TypeAdapter(RefinementInterpretation)


class PlanRefinementRequest(WireModel):
    intent: PlaylistIntent
    preservation: PreservationConstraints
    refinement: RefinementText


class PlanRefinementResponse(WireModel):
    prompt_version: PromptVersion
    result: RefinementInterpretation
