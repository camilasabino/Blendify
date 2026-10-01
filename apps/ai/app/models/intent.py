from typing import Annotated, Literal

from pydantic import Field, StringConstraints, TypeAdapter

from app.models.wire import WireModel

AI_INTENT_NAME_MAX_LENGTH = 200
AI_INTENT_LIST_MAX_ITEMS = 25
AI_INTENT_TARGET_TRACK_COUNT_MAX = 1_000
AI_INTENT_TARGET_DURATION_MINUTES_MAX = 10_080
AI_INTENT_USER_TEXT_MAX_LENGTH = 300

PlaylistKind = Literal["artist_mix", "genre_mix", "discover_artist", "discover_track"]
PopularityMode = Literal["popular", "balanced", "rarities"]
TrackOrderMode = Literal["artist", "title", "random"]
Mood = Literal[
    "happy",
    "calm",
    "energetic",
    "sad",
    "romantic",
    "angry",
    "dark",
    "nostalgic",
    "dreamy",
]
UnsupportedConstraintCategory = Literal[
    "duration",
    "era",
    "energy",
    "mood",
    "activity",
    "tempo",
    "progression",
    "artist_attribute",
    "genre_exclusion",
    "other",
]
ClarificationReason = Literal[
    "ambiguous_request",
    "unsupported_constraint",
    "not_a_playlist_request",
]

IntentName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=AI_INTENT_NAME_MAX_LENGTH),
]
UserText = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=AI_INTENT_USER_TEXT_MAX_LENGTH
    ),
]
TargetTrackCount = Annotated[int, Field(ge=1, le=AI_INTENT_TARGET_TRACK_COUNT_MAX, strict=True)]
TargetDurationMinutes = Annotated[
    int, Field(ge=0, le=AI_INTENT_TARGET_DURATION_MINUTES_MAX, strict=True)
]


class IntentTrackReference(WireModel):
    title: IntentName
    artist: IntentName | None


class UnsupportedConstraint(WireModel):
    category: UnsupportedConstraintCategory
    user_text: UserText


class IntentFilters(WireModel):
    region: IntentName | None


class PlaylistIntent(WireModel):
    kind: PlaylistKind
    artists: Annotated[list[IntentName], Field(max_length=AI_INTENT_LIST_MAX_ITEMS)]
    genres: Annotated[list[IntentName], Field(max_length=AI_INTENT_LIST_MAX_ITEMS)]
    seed_tracks: Annotated[list[IntentTrackReference], Field(max_length=AI_INTENT_LIST_MAX_ITEMS)]
    filters: IntentFilters
    target_track_count: TargetTrackCount | None
    target_duration_minutes: TargetDurationMinutes | None
    mood: Mood | None
    popularity: PopularityMode | None
    order_mode: TrackOrderMode | None
    exclude_artists: Annotated[list[IntentName], Field(max_length=AI_INTENT_LIST_MAX_ITEMS)]
    exclude_tracks: Annotated[
        list[IntentTrackReference], Field(max_length=AI_INTENT_LIST_MAX_ITEMS)
    ]
    unsupported_constraints: Annotated[
        list[UnsupportedConstraint], Field(max_length=AI_INTENT_LIST_MAX_ITEMS)
    ]


class IntentClarification(WireModel):
    reason: ClarificationReason
    unsupported_constraints: Annotated[
        list[UnsupportedConstraint], Field(max_length=AI_INTENT_LIST_MAX_ITEMS)
    ]


class InterpretedIntent(WireModel):
    outcome: Literal["interpreted"]
    intent: PlaylistIntent


class ClarificationNeeded(WireModel):
    outcome: Literal["needs_clarification"]
    clarification: IntentClarification


IntentInterpretation = Annotated[
    InterpretedIntent | ClarificationNeeded, Field(discriminator="outcome")
]

intent_interpretation_adapter: TypeAdapter[InterpretedIntent | ClarificationNeeded] = TypeAdapter(
    IntentInterpretation
)
