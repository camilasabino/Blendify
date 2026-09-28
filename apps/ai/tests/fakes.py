import asyncio
from collections.abc import Mapping, Sequence

from app.providers.model_provider import ModelIntentRequest, ModelIntentResult, ModelTokenUsage

FAKE_MODEL = "fake-model"
FAKE_USAGE = ModelTokenUsage(input_tokens=120, output_tokens=40)

ScriptedOutput = Mapping[str, object] | Exception


class ScriptedModelProvider:
    def __init__(self, outputs: Sequence[ScriptedOutput]) -> None:
        self._outputs = list(outputs)
        self.requests: list[ModelIntentRequest] = []

    @property
    def is_available(self) -> bool:
        return True

    async def generate_intent(self, request: ModelIntentRequest) -> ModelIntentResult:
        self.requests.append(request)
        output = self._outputs.pop(0)
        if isinstance(output, Exception):
            raise output
        return ModelIntentResult(payload=output, model=FAKE_MODEL, usage=FAKE_USAGE)


class HangingModelProvider:
    @property
    def is_available(self) -> bool:
        return True

    async def generate_intent(self, request: ModelIntentRequest) -> ModelIntentResult:
        await asyncio.sleep(60)
        return ModelIntentResult(payload={}, model=FAKE_MODEL, usage=None)


def interpreted_output(**intent_overrides: object) -> dict[str, object]:
    intent: dict[str, object] = {
        "kind": "artist_mix",
        "artists": ["Radiohead", "Interpol"],
        "genres": [],
        "seedTracks": [],
        "targetTrackCount": 30,
        "targetDurationMinutes": None,
        "mood": None,
        "popularity": "rarities",
        "orderMode": None,
        "excludeArtists": ["Coldplay"],
        "excludeTracks": [],
        "unsupportedConstraints": [],
    }
    intent.update(intent_overrides)
    return {"outcome": "interpreted", "intent": intent}


def current_intent(**overrides: object) -> dict[str, object]:
    intent = dict(interpreted_output()["intent"])  # type: ignore[call-overload]
    intent.update(overrides)
    return intent


def empty_preservation() -> dict[str, object]:
    return {"firstTracks": None, "positions": [], "artists": []}


def unchanged_patch(**overrides: object) -> dict[str, object]:
    patch: dict[str, object] = {
        "kind": None,
        "artists": {"add": [], "remove": []},
        "genres": {"add": [], "remove": []},
        "seedTracks": {"add": [], "remove": []},
        "targetTrackCount": None,
        "targetDurationMinutes": None,
        "mood": None,
        "popularity": None,
        "orderMode": None,
        "excludeArtists": {"add": [], "remove": []},
        "excludeTracks": {"add": [], "remove": []},
    }
    patch.update(overrides)
    return patch


def unchanged_preservation_patch(**overrides: object) -> dict[str, object]:
    patch: dict[str, object] = {
        "firstTracks": None,
        "positions": {"add": [], "remove": []},
        "artists": {"add": [], "remove": []},
    }
    patch.update(overrides)
    return patch


def refinement_output(
    *,
    patch: dict[str, object] | None = None,
    preservation: dict[str, object] | None = None,
    unsupported: list[dict[str, str]] | None = None,
) -> dict[str, object]:
    return {
        "outcome": "interpreted",
        "patch": patch or unchanged_patch(),
        "preservation": preservation or unchanged_preservation_patch(),
        "unsupportedConstraints": unsupported or [],
    }


def refinement_clarification(
    reason: str, unsupported: list[dict[str, str]] | None = None
) -> dict[str, object]:
    return {
        "outcome": "needs_clarification",
        "clarification": {"reason": reason, "unsupportedConstraints": unsupported or []},
    }
