from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from app.providers.model_provider import (
    ModelIntentRequest,
    ModelIntentResult,
    ModelInvocationMetadata,
    ModelTokenUsage,
    ModelUnavailableError,
)

SYNTHETIC_PROVIDER_NAME = "synthetic"
SYNTHETIC_GEN_AI_PROVIDER = "blendify.synthetic"
SYNTHETIC_GEN_AI_OPERATION = "chat"
SYNTHETIC_REQUEST_MODEL = "synthetic-smoke-model"
SYNTHETIC_RESPONSE_MODEL = "synthetic-smoke-model-v1"
SYNTHETIC_ARTISTS = ("Synthetic Artist A", "Synthetic Artist B")
SYNTHETIC_TARGET_TRACK_COUNT = 20


@dataclass(frozen=True, slots=True)
class SyntheticReply:
    payload: Mapping[str, object]
    usage: ModelTokenUsage


class SyntheticModelProvider:
    def __init__(self, replies: Sequence[SyntheticReply]) -> None:
        self._replies = tuple(replies)
        self.calls = 0

    @property
    def name(self) -> str:
        return SYNTHETIC_PROVIDER_NAME

    @property
    def is_available(self) -> bool:
        return True

    @property
    def invocation_metadata(self) -> ModelInvocationMetadata | None:
        return ModelInvocationMetadata(
            provider_name=SYNTHETIC_GEN_AI_PROVIDER,
            operation_name=SYNTHETIC_GEN_AI_OPERATION,
            request_model=SYNTHETIC_REQUEST_MODEL,
        )

    async def generate_intent(self, request: ModelIntentRequest) -> ModelIntentResult:
        if self.calls >= len(self._replies):
            raise ModelUnavailableError("The synthetic script has no reply left")

        reply = self._replies[self.calls]
        self.calls += 1
        return ModelIntentResult(
            payload=reply.payload, model=SYNTHETIC_RESPONSE_MODEL, usage=reply.usage
        )


def synthetic_usage(input_tokens: int, output_tokens: int) -> ModelTokenUsage:
    return ModelTokenUsage(
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=input_tokens + output_tokens,
    )


def synthetic_intent() -> dict[str, object]:
    return {
        "kind": "artist_mix",
        "artists": list(SYNTHETIC_ARTISTS),
        "genres": [],
        "seedTracks": [],
        "filters": {
            "region": None,
            "femaleVocals": False,
            "releaseRange": None,
            "excludeLive": False,
        },
        "targetTrackCount": SYNTHETIC_TARGET_TRACK_COUNT,
        "targetDurationMinutes": None,
        "mood": None,
        "popularity": None,
        "orderMode": None,
        "excludeArtists": [],
        "excludeTracks": [],
        "unsupportedConstraints": [],
    }


def synthetic_preservation() -> dict[str, object]:
    return {"firstTracks": None, "positions": [], "artists": []}


def interpreted_intent_payload() -> dict[str, object]:
    return {"outcome": "interpreted", "intent": synthetic_intent()}


def interpreted_refinement_payload() -> dict[str, object]:
    unchanged_names = {"add": [], "remove": []}
    return {
        "outcome": "interpreted",
        "patch": {
            "kind": None,
            "artists": unchanged_names,
            "genres": unchanged_names,
            "seedTracks": unchanged_names,
            "filters": {
                "region": None,
                "femaleVocals": None,
                "releaseRange": None,
                "excludeLive": None,
            },
            "targetTrackCount": None,
            "targetDurationMinutes": None,
            "mood": None,
            "popularity": None,
            "orderMode": None,
            "excludeArtists": unchanged_names,
            "excludeTracks": unchanged_names,
        },
        "preservation": {
            "firstTracks": None,
            "positions": unchanged_names,
            "artists": unchanged_names,
        },
        "unsupportedConstraints": [],
    }


def invalid_output_payload() -> dict[str, object]:
    return {"outcome": "synthetic_invalid_output"}
